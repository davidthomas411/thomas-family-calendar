#!/usr/bin/env python3
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PORT = 8765
CALENDAR_PROXY = "https://api.allorigins.win/raw?url="
DAY_MS = 24 * 60 * 60

CALENDAR_SOURCES = {
    "letter": {
        "urls": [
            "https://www.lmsd.org/cf_calendar/feed.cfm?type=ical&feedID=C1DAEC061C4640888E92DF232728EA82&isgmt=1",
        ],
        "ttl": DAY_MS,
    },
    "school": {
        "urls": [
            "https://www.lmsd.org/calendar/calendar_584.ics",
        ],
        "ttl": DAY_MS,
    },
    "hockey": {
        "urls": [
            "https://ical-cdn.teamsnap.com/team_schedule/filter/games/8008b9a5-560a-4245-859f-465d1136265b.ics",
            "https://ical-cdn.teamsnap.com/team_schedule/filter/games/ae84875e-bcdc-484b-b4b6-ab7256904679.ics",
        ],
        "ttl": DAY_MS,
    },
    "qgenda": {
        "urls": [
            "https://app.qgenda.com/ical?key=8510995d-2d15-4ba7-873a-9c0ad56c1c38",
        ],
        "ttl": DAY_MS,
    },
}

DEFAULT_SETTINGS = {
    "version": 1,
    "updatedAt": "",
    "filters": {
        "includeCustom": True,
        "includeSources": {
            "school": True,
            "hockey": True,
            "letter": False,
            "qgenda": False,
        },
        "includeCalendars": {
            "family": True,
            "dave": True,
            "lorna": True,
            "school": True,
            "meals": False,
        },
        "useUpcomingKeywords": True,
        "hideDailySchoolDetails": True,
    },
}

CALENDAR_CACHE = {}


def send_json(handler, payload, status=HTTPStatus.OK):
    raw = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def parse_ics_date_parts(value):
    if not value:
        return None
    value = value.strip()
    if len(value) == 8 and value.isdigit():
        return {
            "year": int(value[0:4]),
            "month": int(value[4:6]),
            "day": int(value[6:8]),
            "hour": 0,
            "minute": 0,
            "has_time": False,
            "is_utc": False,
        }
    if value.endswith("Z"):
        value = value[:-1]
        is_utc = True
    else:
        is_utc = False
    if "T" not in value:
        return None
    date_part, time_part = value.split("T", 1)
    if len(date_part) != 8 or len(time_part) < 4:
        return None
    return {
        "year": int(date_part[0:4]),
        "month": int(date_part[4:6]),
        "day": int(date_part[6:8]),
        "hour": int(time_part[0:2]),
        "minute": int(time_part[2:4]),
        "has_time": True,
        "is_utc": is_utc,
    }


def normalize_event(event, source):
    parts = parse_ics_date_parts(event.get("dtstart"))
    if not parts:
        return None
    return {
        "summary": event.get("summary", ""),
        "location": event.get("location", ""),
        "startDate": f"{parts['year']:04d}-{parts['month']:02d}-{parts['day']:02d}",
        "startTime": f"{parts['hour']:02d}:{parts['minute']:02d}" if parts["has_time"] else "",
        "allDay": bool(event.get("allDay") or not parts["has_time"]),
        "isUtc": parts["is_utc"],
        "source": source,
    }


def unwrap_ics(text):
    return text.replace("\r\n", "\n").replace("\n ", "").replace("\n\t", "")


def parse_calendar_events(text, source):
    lines = unwrap_ics(text).split("\n")
    events = []
    current = None
    for line in lines:
        if not line:
            continue
        if line == "BEGIN:VEVENT":
            current = {}
            continue
        if line == "END:VEVENT":
            if current:
                normalized = normalize_event(current, source)
                if normalized:
                    events.append(normalized)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        raw_key, value = line.split(":", 1)
        key_parts = raw_key.split(";")
        key = key_parts[0]
        params = key_parts[1:]
        if key == "SUMMARY":
            current["summary"] = value.strip()
        elif key == "DTSTART":
            current["dtstart"] = value.strip()
            current["allDay"] = "VALUE=DATE" in params or len(value.strip()) == 8
        elif key == "LOCATION":
            current["location"] = value.strip()
    events.sort(key=lambda item: (item.get("startDate", ""), item.get("startTime", ""), item.get("summary", "")))
    return events


def fetch_text(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "HomeCalendarPreview/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8")


def fetch_ics(url):
    try:
        text = fetch_text(url)
        if "BEGIN:VCALENDAR" in text:
            return text
    except Exception:
        pass
    proxied = fetch_text(f"{CALENDAR_PROXY}{urllib.parse.quote(url, safe='')}")
    if "BEGIN:VCALENDAR" not in proxied:
        raise RuntimeError("Calendar fetch failed")
    return proxied


def load_calendar(source, force=False):
    config = CALENDAR_SOURCES.get(source)
    if not config:
        return None
    cached = CALENDAR_CACHE.get(source)
    now = time.time()
    if cached and not force and now - cached["fetched_at"] < config["ttl"]:
        return cached
    events = []
    for url in config["urls"]:
        try:
            events.extend(parse_calendar_events(fetch_ics(url), source))
        except Exception:
            continue
    payload = {
        "source": source,
        "fetchedAt": int(now * 1000),
        "events": sorted(events, key=lambda item: (item.get("startDate", ""), item.get("startTime", ""), item.get("summary", ""))),
    }
    CALENDAR_CACHE[source] = {"fetched_at": now, **payload}
    return CALENDAR_CACHE[source]


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/dashboard/index.html")
            self.end_headers()
            return
        if parsed.path == "/api/events":
            return send_json(self, {"events": []})
        if parsed.path == "/api/todos":
            return send_json(self, {"todos": []})
        if parsed.path == "/api/calendar-settings":
            settings = dict(DEFAULT_SETTINGS)
            settings["updatedAt"] = datetime.now(timezone.utc).isoformat()
            return send_json(self, {"settings": settings})
        if parsed.path == "/api/calendar":
            params = urllib.parse.parse_qs(parsed.query)
            source = (params.get("source") or [""])[0]
            payload = load_calendar(source, force=(params.get("refresh") == ["1"]))
            if not payload:
                return send_json(self, {"error": "Invalid source"}, status=HTTPStatus.BAD_REQUEST)
            return send_json(self, payload)
        return super().do_GET()

    def log_message(self, fmt, *args):
        print(f"[preview] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), PreviewHandler)
    print(f"Preview server running at http://127.0.0.1:{PORT}/dashboard/index.html")
    server.serve_forever()
