(() => {
  // Add your OpenWeatherMap API key to enable live data.
  const WEATHER_API_KEY = "69e07fa498f698ec05e255f8de865387";
  const LOCATION = {
    name: "Bala Cynwyd, PA",
    lat: 40.0068,
    lon: -75.226,
  };

  const REFRESH_INTERVAL = 10 * 60 * 1000;
  const LETTER_DAY_CALENDAR_URL = "https://www.lmsd.org/cf_calendar/feed.cfm?type=ical&feedID=C1DAEC061C4640888E92DF232728EA82&isgmt=1";
  const SCHOOL_EVENTS_URL = "https://www.lmsd.org/calendar/calendar_584.ics";
  // CORS-friendly proxy used if the direct calendar feed is blocked by the browser.
  const SCHOOL_CALENDAR_PROXY = "https://api.allorigins.win/raw?url=";
  const SCHOOL_CALENDAR_REFRESH = 30 * 60 * 1000;
  const SCHOOL_CALENDAR_DAYS = 5;
  const SCHOOL_CALENDAR_MAX_EVENTS_PER_DAY = 4;
  const UPCOMING_KEYWORDS = [
    "show",
    "concert",
    "closed",
    "5th",
    "6th",
    "all schools",
    "conference",
    "applause",
    "musical",
    "spring",
    "fall",
    "winter",
    "break",
  ];
  const DAVE_CALENDAR_URL = "https://app.qgenda.com/ical?key=8510995d-2d15-4ba7-873a-9c0ad56c1c38";
  const HOCKEY_CALENDAR_URL = "https://www.lowermerionihc.com/calendar/ical/915181";
  const FAMILY_CALENDAR_REFRESH = 30 * 60 * 1000;
  const FAMILY_EVENTS_MAX = 4;

  const timeEl = document.getElementById("time");
  const dateEl = document.getElementById("date");
  const tempEl = document.getElementById("temp");
  const conditionEl = document.getElementById("condition");
  const iconEl = document.getElementById("weather-icon");
  const tempRangeEl = document.getElementById("temp-range");
  const precipEl = document.getElementById("precip");
  const calendarEl = document.getElementById("calendar-strip");
  const upcomingEl = document.getElementById("upcoming-events");
  const personLists = new Map();

  document.querySelectorAll(".person-items[data-person]").forEach((el) => {
    personLists.set(el.dataset.person, el);
  });

  if (precipEl) {
    precipEl.style.display = "none";
  }

  const root = document.documentElement;
  const skyEl = document.getElementById("sky");
  const moonEl = document.getElementById("moon");
  const MOON_TEXTURE_SRC = "image/moon-texture.jpg";
  const moonTexture = moonEl ? new Image() : null;

  const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LETTER_DAY_ADDONS = {
    A: {
      school: ["K/A: Gym"],
      students: { katherine: ["Gym"], alistair: ["Gym"] },
    },
    B: {
      school: ["K: Challenge", "A: Library"],
      students: { katherine: ["Challenge"], alistair: ["Library"] },
    },
    C: {
      school: ["K/A: Orchestra"],
      students: { katherine: ["Orchestra"], alistair: ["Orchestra"] },
    },
    D: {
      school: ["K/A: Orchestra"],
      students: { katherine: ["Orchestra"], alistair: ["Orchestra"] },
    },
  };

  const state = {
    timezoneOffset: -new Date().getTimezoneOffset() * 60,
    sunrise: null,
    sunset: null,
    cloudCover: 0.4,
    condition: "Clear",
    temp: 68,
    windSpeed: 4,
    isRaining: false,
    rainIntensity: 0,
    tempHigh: null,
    tempLow: null,
    precipText: "",
    letterDayMap: new Map(),
    isFallback: false,
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
  const SYNODIC_MONTH = 29.530588853;
  let lastMoonKey = "";
  let lastMoonSize = 0;

  const moonPhase = (date) => {
    const utcTime = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    );
    const daysSince = (utcTime - MOON_EPOCH) / 86400000;
    let phase = (daysSince % SYNODIC_MONTH) / SYNODIC_MONTH;
    if (phase < 0) {
      phase += 1;
    }
    return phase;
  };

  const moonIllumination = (phase) => 0.5 * (1 - Math.cos(2 * Math.PI * phase));

  const moonOverlapArea = (distance, radius) => {
    if (distance <= 0) {
      return Math.PI * radius * radius;
    }
    if (distance >= 2 * radius) {
      return 0;
    }
    const part = 2 * radius * radius * Math.acos(distance / (2 * radius));
    const part2 = (distance / 2) * Math.sqrt(4 * radius * radius - distance * distance);
    return part - part2;
  };

  const moonShadowOffset = (illumination, radius) => {
    if (illumination <= 0.01) {
      return 0;
    }
    if (illumination >= 0.99) {
      return 2 * radius;
    }
    const target = Math.PI * radius * radius * (1 - illumination);
    let low = 0;
    let high = 2 * radius;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      const area = moonOverlapArea(mid, radius);
      if (area > target) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  };

  const drawMoon = (date) => {
    if (!moonEl) {
      return;
    }

    const rect = moonEl.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (!size) {
      return;
    }

    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (key === lastMoonKey && Math.abs(size - lastMoonSize) < 0.5) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const pixelSize = Math.max(1, Math.round(size * ratio));
    if (moonEl.width !== pixelSize || moonEl.height !== pixelSize) {
      moonEl.width = pixelSize;
      moonEl.height = pixelSize;
    }

    const ctx = moonEl.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const radius = size * 0.46;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();

    if (moonTexture && moonTexture.complete) {
      ctx.drawImage(moonTexture, -radius, -radius, radius * 2, radius * 2);
    } else {
      const surface = ctx.createRadialGradient(-radius * 0.35, -radius * 0.35, radius * 0.15, 0, 0, radius);
      surface.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      surface.addColorStop(0.55, "rgba(218, 228, 242, 0.94)");
      surface.addColorStop(1, "rgba(150, 170, 200, 0.88)");
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const limb = ctx.createRadialGradient(-radius * 0.25, -radius * 0.25, radius * 0.1, 0, 0, radius * 1.05);
    limb.addColorStop(0, "rgba(255, 255, 255, 0.18)");
    limb.addColorStop(0.6, "rgba(255, 255, 255, 0.04)");
    limb.addColorStop(1, "rgba(20, 30, 50, 0.28)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = limb;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const phase = moonPhase(date);
    const illumination = moonIllumination(phase);
    if (illumination < 0.99) {
      const offset = moonShadowOffset(illumination, radius);
      const shadowX = phase <= 0.5 ? -offset : offset;
      ctx.fillStyle = "rgba(10, 18, 30, 0.72)";
      ctx.beginPath();
      ctx.arc(shadowX, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    lastMoonKey = key;
    lastMoonSize = size;
  };

  if (moonTexture) {
    moonTexture.src = MOON_TEXTURE_SRC;
    moonTexture.onload = () => {
      lastMoonKey = "";
      lastMoonSize = 0;
      if (skyEl && skyEl.classList.contains("night")) {
        requestAnimationFrame(() => drawMoon(new Date()));
      }
    };
  }

  const hexToRgb = (hex) => {
    const cleaned = hex.replace("#", "");
    const num = parseInt(cleaned, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  };

  const mixRgb = (a, b, amount) => ({
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  });

  const rgbToString = (rgb) => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const rgbaToString = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

  const getLuma = (rgb) =>
    (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  const getLocationParts = () => {
    const now = new Date(Date.now() + state.timezoneOffset * 1000);
    return {
      hours: now.getUTCHours(),
      minutes: now.getUTCMinutes(),
      day: now.getUTCDay(),
      date: now.getUTCDate(),
      month: now.getUTCMonth(),
      year: now.getUTCFullYear(),
    };
  };

  const formatTime = ({ hours, minutes }) =>
    `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

  const formatDate = ({ day, month, date }) =>
    `${DAY_NAMES[day]}, ${MONTH_NAMES[month]} ${date}`;

  const formatWeekday = (date) => SHORT_DAY_NAMES[date.getDay()];
  const formatMonthDay = (date) => `${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;

  const formatEventTime = (date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const suffix = hours >= 12 ? "PM" : "AM";
    hours %= 12;
    if (hours === 0) {
      hours = 12;
    }
    return `${hours}:${minutes.toString().padStart(2, "0")} ${suffix}`;
  };

  const cleanEventTitle = (title, personKey) => {
    if (!title) {
      return "";
    }
    if (personKey === "dave") {
      const cleaned = title.replace(/\[[^\]]*\]\s*/g, "").trim();
      return cleaned.slice(0, 8).trimEnd();
    }
    return title.trim();
  };

  const normalizeText = (value) => (value || "").toLowerCase();

  const matchesUpcomingKeyword = (summary) => {
    const text = normalizeText(summary);
    return UPCOMING_KEYWORDS.some((keyword) => text.includes(keyword));
  };

  const extractLetterDay = (summary) => {
    const match = summary ? summary.match(/\b([A-D])\s*Day\b/i) : null;
    return match ? match[1].toUpperCase() : null;
  };

  const buildLetterDayEvent = (letter, date) => ({
    summary: `${letter} Day`,
    start: new Date(date),
    allDay: true,
    order: 0,
  });

  const buildSchoolAddOnEvents = (letter, date) => {
    const config = letter ? LETTER_DAY_ADDONS[letter] : null;
    if (!config) {
      return [];
    }
    return config.school.map((summary) => ({
      summary,
      start: new Date(date),
      allDay: true,
      order: 1,
    }));
  };

  const buildStudentAddOnEvents = (letter, date) => {
    const config = letter ? LETTER_DAY_ADDONS[letter] : null;
    const start = new Date(date);
    const build = (student) =>
      (config && config.students[student] ? config.students[student] : []).map((summary) => ({
        summary,
        start,
        allDay: true,
      }));
    return {
      katherine: build("katherine"),
      alistair: build("alistair"),
    };
  };

  const updateClock = () => {
    const parts = getLocationParts();
    if (timeEl) {
      timeEl.textContent = formatTime(parts);
    }
    if (dateEl) {
      dateEl.textContent = formatDate(parts);
    }
  };

  // Unwrap folded iCal lines so properties parse correctly.
  const unwrapIcs = (text) =>
    text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");

  const parseIcsDate = (value) => {
    if (!value) {
      return null;
    }
    const match = value.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hasTime = Boolean(match[4]);
    const hour = Number(match[5] || 0);
    const minute = Number(match[6] || 0);
    const second = Number(match[7] || 0);
    const isUtc = Boolean(match[8]);

    if (!hasTime) {
      return new Date(year, month, day);
    }
    if (isUtc) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  };

  const parseCalendarEvents = (text) => {
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
          events.push(current);
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

  const dayKey = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startOfWeek = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    return start;
  };

  const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

  const getSchoolWeekStart = (date) => {
    const start = startOfWeek(date);
    if (isWeekend(date)) {
      start.setDate(start.getDate() + 7);
    }
    return start;
  };

  const getHockeySaturday = (date) => {
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    const day = base.getDay();
    if (day === 6) {
      return base;
    }
    if (day === 0) {
      const saturday = new Date(base);
      saturday.setDate(base.getDate() - 1);
      return saturday;
    }
    const saturday = new Date(base);
    saturday.setDate(base.getDate() + (6 - day));
    return saturday;
  };

  const buildWeekDays = (startDate, count) => {
    const days = [];
    for (let i = 0; i < count; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push({ date, key: dayKey(date) });
    }
    return days;
  };

  const setCalendarStatus = (container, message) => {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const status = document.createElement("div");
    status.className = "calendar-status";
    status.textContent = message;
    container.appendChild(status);
  };

  const renderUpcomingEvents = (events) => {
    if (!upcomingEl) {
      return;
    }
    upcomingEl.innerHTML = "";

    if (!events.length) {
      setCalendarStatus(upcomingEl, "No upcoming events.");
      return;
    }

    events.forEach((event) => {
      const item = document.createElement("div");
      item.className = "upcoming-item";

      const meta = document.createElement("div");
      meta.className = "upcoming-meta";
      const dateLabel = `${formatWeekday(event.start)}, ${formatMonthDay(event.start)}`;
      const timeLabel = event.allDay ? "" : formatEventTime(event.start);
      meta.textContent = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;

      const title = document.createElement("div");
      title.className = "upcoming-title";
      title.textContent = event.summary || "School event";

      item.appendChild(meta);
      item.appendChild(title);
      upcomingEl.appendChild(item);
    });
  };

  const renderDayGrid = (container, tiles) => {
    if (!container) {
      return;
    }
    container.innerHTML = "";

    if (!tiles.length) {
      setCalendarStatus(container, "No upcoming events.");
      return;
    }

    tiles.forEach((tile) => {
      const dayCard = document.createElement("div");
      dayCard.className = "week-day";
      if (tile.kind) {
        dayCard.classList.add(tile.kind);
      }
      if (tile.highlight) {
        dayCard.classList.add("current");
      }

      const header = document.createElement("div");
      header.className = "week-day-header";

      const name = document.createElement("div");
      name.className = "week-day-name";
      name.textContent = formatWeekday(tile.date);

      const dateLabel = document.createElement("div");
      dateLabel.className = "week-day-date";
      dateLabel.textContent = formatMonthDay(tile.date);

      header.appendChild(name);
      header.appendChild(dateLabel);

      if (tile.tag) {
        const tag = document.createElement("div");
        tag.className = "week-day-tag";
        tag.textContent = tile.tag;
        header.appendChild(tag);
      }

      const eventsWrap = document.createElement("div");
      eventsWrap.className = "week-events";

      const events = tile.events || [];
      if (!events.length) {
        const empty = document.createElement("div");
        empty.className = "week-event-empty";
        empty.textContent = tile.emptyLabel || "No events";
        eventsWrap.appendChild(empty);
      } else {
        const sorted = events.slice().sort((a, b) => {
          const orderA = Number.isFinite(a.order) ? a.order : 2;
          const orderB = Number.isFinite(b.order) ? b.order : 2;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.start - b.start;
        });
        const maxEvents = tile.maxEvents || SCHOOL_CALENDAR_MAX_EVENTS_PER_DAY;
        const shown = sorted.slice(0, maxEvents);

        shown.forEach((event) => {
          const eventRow = document.createElement("div");
          eventRow.className = "week-event";

          const time = document.createElement("div");
          time.className = "week-event-time";
          time.textContent = event.allDay ? "" : formatEventTime(event.start);

          const title = document.createElement("div");
          title.className = "week-event-title";
          title.textContent = event.summary || "School event";

          eventRow.appendChild(time);
          eventRow.appendChild(title);
          eventsWrap.appendChild(eventRow);
        });

        if (sorted.length > maxEvents) {
          const more = document.createElement("div");
          more.className = "week-more";
          more.textContent = `+${sorted.length - maxEvents} more`;
          eventsWrap.appendChild(more);
        }
      }

      dayCard.appendChild(header);
      dayCard.appendChild(eventsWrap);
      container.appendChild(dayCard);
    });
  };

  const toProxyUrl = (url) => `${SCHOOL_CALENDAR_PROXY}${encodeURIComponent(url)}`;

  const fetchCalendarText = async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Calendar fetch failed");
    }
    return response.text();
  };

  const isIcsPayload = (text) => typeof text === "string" && text.includes("BEGIN:VCALENDAR");

  const fetchIcs = async (url) => {
    try {
      const direct = await fetchCalendarText(url);
      if (isIcsPayload(direct)) {
        return direct;
      }
    } catch (error) {
      // Fall through to proxy.
    }

    if (!SCHOOL_CALENDAR_PROXY) {
      throw new Error("Calendar fetch failed");
    }

    const proxied = await fetchCalendarText(toProxyUrl(url));
    if (!isIcsPayload(proxied)) {
      throw new Error("Calendar fetch failed");
    }
    return proxied;
  };

  const refreshCalendar = async () => {
    if (!calendarEl) {
      return;
    }

    try {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const weekStart = getSchoolWeekStart(now);
      const rangeEnd = new Date(weekStart);
      rangeEnd.setDate(rangeEnd.getDate() + SCHOOL_CALENDAR_DAYS);
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const upcomingEnd = new Date(nextWeekStart);
      upcomingEnd.setDate(upcomingEnd.getDate() + 30);

      if (upcomingEl) {
        setCalendarStatus(upcomingEl, "Loading events...");
      }

      let letterDayAvailable = true;
      const letterDayMap = new Map();
      try {
        const text = await fetchIcs(LETTER_DAY_CALENDAR_URL);
        const rawEvents = parseCalendarEvents(text);
        rawEvents
          .map((event) => {
            const start = parseIcsDate(event.dtstart);
            return start ? { ...event, start } : null;
          })
          .filter(Boolean)
          .forEach((event) => {
            if (event.start < weekStart || event.start >= rangeEnd) {
              return;
            }
            const letter = extractLetterDay(event.summary);
            if (!letter) {
              return;
            }
            letterDayMap.set(dayKey(event.start), letter);
          });
      } catch (error) {
        letterDayAvailable = false;
      }

      state.letterDayMap = letterDayMap;

      let schoolEventsAvailable = true;
      const schoolEventsByDay = new Map();
      const upcomingEvents = [];
      try {
        const text = await fetchIcs(SCHOOL_EVENTS_URL);
        const rawEvents = parseCalendarEvents(text);
        rawEvents
          .map((event) => {
            const start = parseIcsDate(event.dtstart);
            return start ? { ...event, start } : null;
          })
          .filter(Boolean)
          .forEach((event) => {
            const isUpcomingMatch = matchesUpcomingKeyword(event.summary);
            if (isUpcomingMatch && event.start >= nextWeekStart && event.start < upcomingEnd) {
              upcomingEvents.push(event);
            }
            if (!isUpcomingMatch) {
              return;
            }
            if (event.start < weekStart || event.start >= rangeEnd) {
              return;
            }
            const key = dayKey(event.start);
            if (!schoolEventsByDay.has(key)) {
              schoolEventsByDay.set(key, []);
            }
            schoolEventsByDay.get(key).push({ ...event, order: 2 });
          });
      } catch (error) {
        schoolEventsAvailable = false;
      }

      if (schoolEventsAvailable) {
        const sortedUpcoming = upcomingEvents.slice().sort((a, b) => a.start - b.start);
        renderUpcomingEvents(sortedUpcoming);
      } else if (upcomingEl) {
        setCalendarStatus(upcomingEl, "Upcoming events unavailable.");
      }

      let hockeyAvailable = true;
      const hockeyEventsByDay = new Map();
      const hockeyDate = getHockeySaturday(now);
      const hockeyKey = dayKey(hockeyDate);
      try {
        const text = await fetchIcs(HOCKEY_CALENDAR_URL);
        const rawEvents = parseCalendarEvents(text);
        rawEvents
          .map((event) => {
            const start = parseIcsDate(event.dtstart);
            return start ? { ...event, start } : null;
          })
          .filter(Boolean)
          .forEach((event) => {
            const key = dayKey(event.start);
            if (key !== hockeyKey) {
              return;
            }
            if (!hockeyEventsByDay.has(key)) {
              hockeyEventsByDay.set(key, []);
            }
            hockeyEventsByDay.get(key).push(event);
          });
      } catch (error) {
        hockeyAvailable = false;
      }

      const schoolAvailable = letterDayAvailable || schoolEventsAvailable;

      if (!schoolAvailable && !hockeyAvailable) {
        setCalendarStatus(calendarEl, "Calendar unavailable.");
        return;
      }

      const highlightKey = !isWeekend(now) ? dayKey(now) : null;
      const weekDays = buildWeekDays(weekStart, SCHOOL_CALENDAR_DAYS).map((day) => ({
        ...day,
        kind: "school",
        events: [
          ...(letterDayMap.has(day.key) ? [buildLetterDayEvent(letterDayMap.get(day.key), day.date)] : []),
          ...buildSchoolAddOnEvents(letterDayMap.get(day.key), day.date),
          ...(schoolEventsByDay.get(day.key) || []),
        ],
        emptyLabel: schoolAvailable ? "No school" : "School unavailable",
        maxEvents: SCHOOL_CALENDAR_MAX_EVENTS_PER_DAY,
        highlight: highlightKey === day.key,
      }));

      const hockeyTile = {
        date: hockeyDate,
        key: hockeyKey,
        kind: "hockey",
        tag: "Hockey",
        events: hockeyEventsByDay.get(hockeyKey) || [],
        emptyLabel: hockeyAvailable ? "No games" : "Hockey unavailable",
        maxEvents: 3,
        highlight: false,
      };

      const tiles = isWeekend(now) ? [hockeyTile, ...weekDays] : [...weekDays, hockeyTile];
      renderDayGrid(calendarEl, tiles);

      const todayLetter = letterDayMap.get(dayKey(now));
      const studentAddOns = buildStudentAddOnEvents(todayLetter, now);
      if (personLists.has("katherine")) {
        renderPersonEvents("katherine", studentAddOns.katherine);
      }
      if (personLists.has("alistair")) {
        renderPersonEvents("alistair", studentAddOns.alistair);
      }
    } catch (error) {
      setCalendarStatus(calendarEl, "Calendar unavailable.");
      if (upcomingEl) {
        setCalendarStatus(upcomingEl, "Upcoming events unavailable.");
      }
    }
  };

  const setPersonStatus = (personKey, message) => {
    const container = personLists.get(personKey);
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const status = document.createElement("div");
    status.className = "person-empty";
    status.textContent = message;
    container.appendChild(status);
  };

  const renderPersonEvents = (personKey, events) => {
    const container = personLists.get(personKey);
    if (!container) {
      return;
    }
    container.innerHTML = "";

    if (!events.length) {
      setPersonStatus(personKey, "No events scheduled");
      return;
    }

    const todayKey = dayKey(new Date());
    events.slice(0, FAMILY_EVENTS_MAX).forEach((event) => {
      const row = document.createElement("div");
      row.className = "person-item";

      const time = document.createElement("span");
      time.className = "person-time";
      const eventKey = dayKey(event.start);
      if (event.allDay) {
        time.textContent = eventKey === todayKey ? "" : formatWeekday(event.start);
      } else if (eventKey === todayKey) {
        time.textContent = formatEventTime(event.start);
      } else {
        time.textContent = `${formatWeekday(event.start)} ${formatEventTime(event.start)}`;
      }

      const title = document.createElement("span");
      title.className = "person-task";
      const cleaned = cleanEventTitle(event.summary, personKey);
      title.textContent = cleaned || "Scheduled event";

      row.appendChild(time);
      row.appendChild(title);
      container.appendChild(row);
    });
  };

  const refreshFamilyCalendars = async () => {
    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    if (personLists.has("lorna")) {
      setPersonStatus("lorna", "No events scheduled");
    }

    const todayLetter = state.letterDayMap.get(dayKey(now));
    const studentAddOns = buildStudentAddOnEvents(todayLetter, now);
    if (personLists.has("katherine")) {
      renderPersonEvents("katherine", studentAddOns.katherine);
    }
    if (personLists.has("alistair")) {
      renderPersonEvents("alistair", studentAddOns.alistair);
    }

    if (!personLists.has("dave")) {
      return;
    }

    try {
      const text = await fetchIcs(DAVE_CALENDAR_URL);
      const rawEvents = parseCalendarEvents(text);
      const todayKey = dayKey(now);

      const events = rawEvents
        .map((event) => {
          const start = parseIcsDate(event.dtstart);
          return start ? { ...event, start } : null;
        })
        .filter(Boolean)
        .filter((event) => {
          if (event.allDay && dayKey(event.start) === todayKey) {
            return true;
          }
          return event.start >= now && event.start < rangeEnd;
        })
        .sort((a, b) => a.start - b.start);

      renderPersonEvents("dave", events);
    } catch (error) {
      setPersonStatus("dave", "Calendar unavailable");
    }
  };


  const getFallbackWeather = () => {
    const parts = getLocationParts();
    const sunriseUtc = Date.UTC(parts.year, parts.month, parts.date, 6, 30) - state.timezoneOffset * 1000;
    const sunsetUtc = Date.UTC(parts.year, parts.month, parts.date, 19, 30) - state.timezoneOffset * 1000;

    return {
      weather: [{ main: "Clouds", description: "broken clouds" }],
      clouds: { all: 62 },
      main: { temp: 67 },
      wind: { speed: 5 },
      sys: { sunrise: Math.floor(sunriseUtc / 1000), sunset: Math.floor(sunsetUtc / 1000) },
      timezone: state.timezoneOffset,
      fallback: true,
    };
  };

  const fetchWeather = async () => {
    if (!WEATHER_API_KEY) {
      return getFallbackWeather();
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LOCATION.lat}&lon=${LOCATION.lon}&units=imperial&appid=${WEATHER_API_KEY}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Weather fetch failed");
    }
    return response.json();
  };

  const fetchForecast = async () => {
    if (!WEATHER_API_KEY) {
      return null;
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${LOCATION.lat}&lon=${LOCATION.lon}&units=imperial&appid=${WEATHER_API_KEY}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Forecast fetch failed");
    }
    return response.json();
  };

  const applyForecast = (forecast) => {
    if (!forecast || !forecast.list) {
      return;
    }

    if (forecast.city && typeof forecast.city.timezone === "number") {
      state.timezoneOffset = forecast.city.timezone;
    }

    const now = new Date();
    const todayKey = dayKey(now);
    let tempMin = null;
    let tempMax = null;
    let rainTotal = 0;
    let snowTotal = 0;
    let maxPop = 0;
    let hasRain = false;
    let hasSnow = false;

    forecast.list.forEach((item) => {
      const date = new Date(item.dt * 1000);
      const key = dayKey(date);
      if (key !== todayKey) {
        return;
      }

      if (typeof item.main.temp_min === "number") {
        tempMin = tempMin == null ? item.main.temp_min : Math.min(tempMin, item.main.temp_min);
      }
      if (typeof item.main.temp_max === "number") {
        tempMax = tempMax == null ? item.main.temp_max : Math.max(tempMax, item.main.temp_max);
      }

      if (typeof item.pop === "number") {
        maxPop = Math.max(maxPop, item.pop);
      }

      if (item.rain && typeof item.rain["3h"] === "number") {
        rainTotal += item.rain["3h"];
      }
      if (item.snow && typeof item.snow["3h"] === "number") {
        snowTotal += item.snow["3h"];
      }

      if (item.weather && item.weather.some((entry) => entry.main === "Rain")) {
        hasRain = true;
      }
      if (item.weather && item.weather.some((entry) => entry.main === "Snow")) {
        hasSnow = true;
      }
    });

    state.tempHigh = tempMax;
    state.tempLow = tempMin;

    if (tempRangeEl && tempMax != null && tempMin != null) {
      tempRangeEl.textContent = `H ${Math.round(tempMax)}° / L ${Math.round(tempMin)}°`;
    } else if (tempRangeEl) {
      tempRangeEl.textContent = "";
    }

    const mmToInches = (value) => value / 25.4;
    let precipText = "";
    if (hasSnow || snowTotal > 0) {
      if (snowTotal > 0) {
        const snowInches = mmToInches(snowTotal);
        precipText = `Snow total ${snowInches.toFixed(1)} in`;
      } else {
        precipText = `Snow chance ${Math.round(maxPop * 100)}%`;
      }
    } else if (hasRain || rainTotal > 0) {
      if (rainTotal > 0) {
        const rainInches = mmToInches(rainTotal);
        precipText = `Rain total ${rainInches.toFixed(1)} in`;
      } else {
        precipText = `Rain chance ${Math.round(maxPop * 100)}%`;
      }
    }

    state.precipText = precipText;
    if (precipEl) {
      if (precipText) {
        precipEl.textContent = precipText;
        precipEl.style.display = "block";
      } else {
        precipEl.textContent = "";
        precipEl.style.display = "none";
      }
    }
  };

  const getPhase = (nowSeconds, sunrise, sunset) => {
    if (!sunrise || !sunset) {
      const hour = getLocationParts().hours;
      if (hour >= 6 && hour < 17) {
        return "day";
      }
      if (hour >= 17 && hour < 20) {
        return "dusk";
      }
      return "night";
    }

    const transition = 45 * 60;
    if (nowSeconds >= sunrise - transition && nowSeconds < sunrise + transition) {
      return "dawn";
    }
    if (nowSeconds >= sunset - transition && nowSeconds < sunset + transition) {
      return "dusk";
    }
    if (nowSeconds >= sunrise + transition && nowSeconds < sunset - transition) {
      return "day";
    }
    return "night";
  };

  const paletteForPhase = (phase) => {
    const palettes = {
      day: {
        top: "#8ec5f7",
        bottom: "#eaf5ff",
        glow: "#ffffff",
      },
      dawn: {
        top: "#f2bda1",
        bottom: "#7ca3e2",
        glow: "#ffd8c2",
      },
      dusk: {
        top: "#f4b08b",
        bottom: "#6a86d3",
        glow: "#ffcaa8",
      },
      night: {
        top: "#0b1a36",
        bottom: "#0f2548",
        glow: "#5877b5",
      },
    };

    return palettes[phase] || palettes.day;
  };

  // Shift sky palette by time of day and cloud cover.
  const setSkyColors = (phase, cloudCover) => {
    const palette = paletteForPhase(phase);
    const overcast = hexToRgb("#bcc5d3");
    const topBase = hexToRgb(palette.top);
    const bottomBase = hexToRgb(palette.bottom);
    const glowBase = hexToRgb(palette.glow);
    const cloudMix = phase === "night"
      ? clamp(cloudCover * 0.35, 0, 0.4)
      : clamp(cloudCover * 0.65, 0, 0.7);

    const top = mixRgb(topBase, overcast, cloudMix);
    const bottom = mixRgb(bottomBase, overcast, cloudMix * 0.8);
    const glow = mixRgb(glowBase, overcast, cloudMix * 0.5);

    root.style.setProperty("--sky-top", rgbToString(top));
    root.style.setProperty("--sky-bottom", rgbToString(bottom));
    const isNightScene = phase === "night" || phase === "dusk";
    root.style.setProperty("--sky-glow", rgbaToString(glow, isNightScene ? 0.25 : 0.6));
    root.style.setProperty("--haze", isNightScene ? "rgba(18, 28, 58, 0.18)" : "rgba(255, 255, 255, 0.22)");

    const luma = getLuma(bottom);
    const useDarkText = luma > 0.68;
    root.style.setProperty(
      "--text-primary",
      useDarkText ? "rgba(18, 32, 52, 0.95)" : "rgba(235, 242, 255, 0.96)"
    );
    root.style.setProperty(
      "--text-secondary",
      useDarkText ? "rgba(18, 32, 52, 0.7)" : "rgba(216, 226, 245, 0.7)"
    );
    root.style.setProperty(
      "--panel-bg",
      useDarkText ? "rgba(255, 255, 255, 0.28)" : "rgba(16, 26, 44, 0.38)"
    );
    root.style.setProperty(
      "--panel-border",
      useDarkText ? "rgba(255, 255, 255, 0.42)" : "rgba(255, 255, 255, 0.2)"
    );
    root.style.setProperty(
      "--panel-shadow",
      useDarkText ? "rgba(5, 16, 32, 0.2)" : "rgba(0, 0, 0, 0.45)"
    );

    root.style.setProperty("--sky-glow-x", isNightScene ? "76%" : "70%");
    root.style.setProperty("--sky-glow-y", isNightScene ? "16%" : "20%");

    const cloudHighlightBase = hexToRgb("#ffffff");
    const cloudCoreBase = hexToRgb("#f2f6ff");
    const cloudShadowBase = hexToRgb("#cfd9e6");
    let cloudHighlight = mixRgb(cloudHighlightBase, overcast, cloudMix * 0.35);
    let cloudCore = mixRgb(cloudCoreBase, overcast, cloudMix * 0.5);
    let cloudShadow = mixRgb(cloudShadowBase, overcast, cloudMix * 0.7);

    if (phase === "night") {
      const nightTint = hexToRgb("#8aa2c6");
      cloudHighlight = mixRgb(cloudHighlight, nightTint, 0.55);
      cloudCore = mixRgb(cloudCore, nightTint, 0.65);
      cloudShadow = mixRgb(cloudShadow, nightTint, 0.75);
    } else if (phase === "dawn" || phase === "dusk") {
      const warmTint = hexToRgb("#f4c9a6");
      cloudHighlight = mixRgb(cloudHighlight, warmTint, 0.2);
      cloudCore = mixRgb(cloudCore, warmTint, 0.15);
    }

    root.style.setProperty("--cloud-highlight", rgbToString(cloudHighlight));
    root.style.setProperty("--cloud-core", rgbToString(cloudCore));
    root.style.setProperty("--cloud-shadow", rgbToString(cloudShadow));

    if (skyEl) {
      skyEl.classList.toggle("night", isNightScene);
    }
    if (isNightScene) {
      requestAnimationFrame(() => drawMoon(new Date()));
    }
  };

  const iconForCondition = (condition, isDay) => {
    const stroke = "currentColor";
    const common = `fill=\"none\" stroke=\"${stroke}\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"`;

    if (condition === "Clear") {
      return isDay
        ? `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><circle cx=\"32\" cy=\"32\" r=\"10\" ${common}/><path d=\"M32 6v8M32 50v8M6 32h8M50 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6\" ${common}/></svg>`
        : `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M41 10a16 16 0 1 0 13 25 18 18 0 1 1-13-25z\" ${common}/></svg>`;
    }

    if (condition === "Rain" || condition === "Drizzle" || condition === "Thunderstorm") {
      return `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M20 40a12 12 0 0 1 0-24 16 16 0 0 1 30 6h2a10 10 0 1 1 0 20H20z\" ${common}/><path d=\"M24 46l-4 8M34 46l-4 8M44 46l-4 8\" ${common}/></svg>`;
    }

    if (condition === "Snow") {
      return `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M20 38a12 12 0 0 1 0-24 16 16 0 0 1 30 6h2a10 10 0 1 1 0 20H20z\" ${common}/><path d=\"M32 46v12M26 52h12M26 48l12 8M26 60l12-8\" ${common}/></svg>`;
    }

    if (condition === "Mist" || condition === "Fog" || condition === "Haze" || condition === "Smoke") {
      return `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M12 30h40M16 38h32M20 46h24\" ${common}/></svg>`;
    }

    return `<svg viewBox=\"0 0 64 64\" aria-hidden=\"true\"><path d=\"M20 38a12 12 0 0 1 0-24 16 16 0 0 1 30 6h2a10 10 0 1 1 0 20H20z\" ${common}/></svg>`;
  };

  const applyWeather = (data) => {
    state.isFallback = Boolean(data.fallback);
    state.cloudCover = data.clouds && typeof data.clouds.all === "number"
      ? data.clouds.all / 100
      : 0.3;
    state.condition = data.weather && data.weather[0] ? data.weather[0].main : "Clear";
    state.temp = data.main && typeof data.main.temp === "number" ? data.main.temp : state.temp;
    state.windSpeed = data.wind && typeof data.wind.speed === "number" ? data.wind.speed : state.windSpeed;
    state.sunrise = data.sys && data.sys.sunrise ? data.sys.sunrise : state.sunrise;
    state.sunset = data.sys && data.sys.sunset ? data.sys.sunset : state.sunset;
    state.timezoneOffset = typeof data.timezone === "number" ? data.timezone : state.timezoneOffset;
    state.isRaining = ["Rain", "Drizzle", "Thunderstorm"].includes(state.condition);
    const rainAmount = data.rain ? (data.rain["1h"] || data.rain["3h"]) : 0;
    state.rainIntensity = rainAmount ? clamp(rainAmount / 6, 0.2, 0.8) : 0;

    if (tempEl) {
      tempEl.textContent = `${Math.round(state.temp)}°`;
    }
    if (conditionEl) {
      conditionEl.textContent = data.weather && data.weather[0] ? data.weather[0].description : state.condition;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    let phase = getPhase(nowSeconds, state.sunrise, state.sunset);
    if (state.isFallback) {
      const hour = getLocationParts().hours;
      if (hour >= 18 || hour < 6) {
        phase = "night";
      } else if (hour >= 17) {
        phase = "dusk";
      } else if (hour < 7) {
        phase = "dawn";
      }
    }
    const isDay = phase === "day" || phase === "dawn";
    setSkyColors(phase, state.cloudCover);

    if (iconEl) {
      iconEl.innerHTML = iconForCondition(state.condition, isDay);
    }

    if (window.DashboardSky && typeof window.DashboardSky.setConditions === "function") {
      window.DashboardSky.setConditions({
        cloudCover: state.cloudCover,
        windSpeed: state.windSpeed,
        isNight: phase === "night",
        isRaining: state.isRaining,
        rainIntensity: state.rainIntensity,
      });
    }

    updateClock();
  };

  const refreshWeather = async () => {
    try {
      const data = await fetchWeather();
      applyWeather(data);
    } catch (error) {
      applyWeather(getFallbackWeather());
    }

    try {
      const forecast = await fetchForecast();
      applyForecast(forecast);
    } catch (error) {
      if (tempRangeEl) {
        tempRangeEl.textContent = "";
      }
      if (precipEl) {
        precipEl.textContent = "";
        precipEl.style.display = "none";
      }
    }
  };

  if (moonEl) {
    window.addEventListener("resize", () => {
      lastMoonKey = "";
      lastMoonSize = 0;
      if (skyEl && skyEl.classList.contains("night")) {
        requestAnimationFrame(() => drawMoon(new Date()));
      }
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
  refreshWeather();
  setInterval(refreshWeather, REFRESH_INTERVAL);
  refreshCalendar();
  setInterval(refreshCalendar, SCHOOL_CALENDAR_REFRESH);
  refreshFamilyCalendars();
  setInterval(refreshFamilyCalendars, FAMILY_CALENDAR_REFRESH);
})();
