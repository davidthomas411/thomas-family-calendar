const CALENDAR_SOURCES = {
  letter: {
    url: "https://www.lmsd.org/cf_calendar/feed.cfm?type=ical&feedID=C1DAEC061C4640888E92DF232728EA82&isgmt=1",
    ttlMs: 24 * 60 * 60 * 1000,
  },
  school: {
    url: "https://www.lmsd.org/calendar/calendar_584.ics",
    ttlMs: 24 * 60 * 60 * 1000,
  },
  hockey: {
    url: "https://www.lowermerionihc.com/calendar/ical/915181",
    ttlMs: 24 * 60 * 60 * 1000,
  },
  qgenda: {
    url: "https://app.qgenda.com/ical?key=8510995d-2d15-4ba7-873a-9c0ad56c1c38",
    ttlMs: 24 * 60 * 60 * 1000,
  },
};

const CALENDAR_PROXY = "https://api.allorigins.win/raw?url=";

const pad2 = (value) => `${value}`.padStart(2, "0");

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const getDebugFlag = (req) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const debug = url.searchParams.get("debug");
    return debug === "1" || debug === "true";
  } catch (error) {
    return false;
  }
};

const formatError = (error) => {
  if (!error) {
    return null;
  }
  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || "",
  };
};

const sendError = (res, status, message, error, debug) => {
  const payload = { error: message };
  if (debug && error) {
    payload.debug = formatError(error);
  }
  return sendJson(res, status, payload);
};

const parseIcsDateParts = (value) => {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) {
    return null;
  }
  const hasTime = Boolean(match[4]);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[5] || 0),
    minute: Number(match[6] || 0),
    hasTime,
    isUtc: Boolean(match[8]),
  };
};

const normalizeEvent = (event, source) => {
  const parts = parseIcsDateParts(event.dtstart);
  if (!parts || !parts.year || !parts.month || !parts.day) {
    return null;
  }
  return {
    summary: event.summary || "",
    location: event.location || "",
    startDate: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    startTime: parts.hasTime ? `${pad2(parts.hour)}:${pad2(parts.minute)}` : "",
    allDay: Boolean(event.allDay || !parts.hasTime),
    isUtc: parts.isUtc,
    source,
  };
};

const unwrapIcs = (text) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");

const parseCalendarEvents = (text, source) => {
  const lines = unwrapIcs(text).split("\n");
  const events = [];
  let current = null;

  lines.forEach((line) => {
    if (!line) {
      return;
    }
    if (line === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const normalized = normalizeEvent(current, source);
        if (normalized) {
          events.push(normalized);
        }
      }
      current = null;
      return;
    }
    if (!current) {
      return;
    }

    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) {
      return;
    }
    const value = rest.join(":").trim();
    const keyParts = rawKey.split(";");
    const key = keyParts[0];
    const params = keyParts.slice(1);

    if (key === "SUMMARY") {
      current.summary = value;
    } else if (key === "DTSTART") {
      current.dtstart = value;
      current.allDay = params.includes("VALUE=DATE") || value.length === 8;
    } else if (key === "DTEND") {
      current.dtend = value;
    } else if (key === "LOCATION") {
      current.location = value;
    }
  });

  return events;
};

const isIcsPayload = (text) => typeof text === "string" && text.includes("BEGIN:VCALENDAR");

const fetchCalendarText = async (url) => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "HomeCalendar/1.0" },
  });
  if (!response.ok) {
    throw new Error("Calendar fetch failed");
  }
  return response.text();
};

const fetchWithFallback = async (url) => {
  try {
    const direct = await fetchCalendarText(url);
    if (isIcsPayload(direct)) {
      return direct;
    }
  } catch (error) {
    // Fall through to proxy.
  }

  const proxied = await fetchCalendarText(`${CALENDAR_PROXY}${encodeURIComponent(url)}`);
  if (!isIcsPayload(proxied)) {
    throw new Error("Calendar fetch failed");
  }
  return proxied;
};

const loadCache = async (key) => {
  const { head } = await import("@vercel/blob");
  try {
    const blob = await head(key);
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data && Array.isArray(data.events) ? data : null;
  } catch (error) {
    const message = error && error.message ? error.message : "";
    if (
      (error && error.name === "BlobNotFoundError") ||
      (error && error.status === 404) ||
      message.includes("requested blob does not exist")
    ) {
      return null;
    }
    throw error;
  }
};

const saveCache = async (key, payload) => {
  const { put } = await import("@vercel/blob");
  await put(key, JSON.stringify(payload, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const debug = getDebugFlag(req);
  let source = "";
  let refresh = false;
  try {
    const url = new URL(req.url, "http://localhost");
    source = url.searchParams.get("source") || "";
    refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
  } catch (error) {
    source = "";
  }

  const config = CALENDAR_SOURCES[source];
  if (!config) {
    return sendJson(res, 400, { error: "Invalid source" });
  }
  if (!config.url) {
    return sendJson(res, 500, { error: "Calendar not configured" });
  }

  const cacheKey = `calendar/${source}.json`;
  const now = Date.now();

  let cached = null;
  try {
    cached = await loadCache(cacheKey);
  } catch (error) {
    return sendError(res, 500, "Unable to load cache", error, debug);
  }

  const isFresh = cached && now - cached.fetchedAt < config.ttlMs;
  if (!refresh && isFresh) {
    return sendJson(res, 200, { source, fetchedAt: cached.fetchedAt, events: cached.events });
  }

  try {
    const text = await fetchWithFallback(config.url);
    const events = parseCalendarEvents(text, source);
    const payload = {
      source,
      fetchedAt: now,
      events,
    };
    await saveCache(cacheKey, payload);
    return sendJson(res, 200, payload);
  } catch (error) {
    if (cached) {
      return sendJson(res, 200, { source, fetchedAt: cached.fetchedAt, events: cached.events, stale: true });
    }
    return sendError(res, 500, "Unable to load calendar", error, debug);
  }
};
