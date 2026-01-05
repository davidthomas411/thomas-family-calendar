(() => {
  const WEATHER_API_KEY = "69e07fa498f698ec05e255f8de865387";
  const LOCATION = {
    name: "Bala Cynwyd, PA",
    lat: 40.0068,
    lon: -75.226,
  };
  const WEATHER_REFRESH_INTERVAL = 15 * 60 * 1000;
  const SCHOOL_CALENDAR_REFRESH = 30 * 60 * 1000;
  const SCHOOL_CALENDAR_DAYS = 5;
  const SCHOOL_CALENDAR_MAX_EVENTS_PER_DAY = 4;
  const THEME_REFRESH_INTERVAL = 60 * 1000;
  const CUSTOM_EVENTS_CACHE_TTL = 15 * 1000;
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
  const FAMILY_CALENDAR_REFRESH = 30 * 60 * 1000;
  const FAMILY_EVENTS_MAX = 4;
  const EVENTS_API_URL = "/api/events";
  const CALENDAR_API_URL = "/api/calendar";
  const LOGIN_API_URL = "/api/login";
  const SESSION_KEY = "dashboardSession";
  const CALENDAR_OPTIONS = [
    { value: "family", label: "Family" },
    { value: "school", label: "School" },
    { value: "dave", label: "Dave" },
    { value: "lorna", label: "Lorna" },
  ];

  const timeEl = document.getElementById("time");
  const dateEl = document.getElementById("date");
  const tempEl = document.getElementById("temp");
  const conditionEl = document.getElementById("condition");
  const tempRangeEl = document.getElementById("temp-range");
  const calendarEl = document.getElementById("calendar-strip");
  const upcomingEl = document.getElementById("upcoming-events");
  const personLists = new Map();
  const addEventButton = document.getElementById("add-event-button");
  const loginModal = document.getElementById("login-modal");
  const eventModal = document.getElementById("event-modal");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginUsername = document.getElementById("login-username");
  const loginPassword = document.getElementById("login-password");
  const eventForm = document.getElementById("event-form");
  const eventError = document.getElementById("event-error");
  const eventDate = document.getElementById("event-date");
  const eventTime = document.getElementById("event-time");
  const eventDetails = document.getElementById("event-details");
  const eventCalendar = document.getElementById("event-calendar");
  const userLabel = document.getElementById("user-label");
  const logoutButton = document.getElementById("logout-button");

  document.querySelectorAll(".person-items[data-person]").forEach((el) => {
    personLists.set(el.dataset.person, el);
  });

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
    letterDayMap: new Map(),
  };

  const customEventsCache = {
    events: [],
    fetchedAt: 0,
  };

  let pendingAction = null;

  const loadSession = () => {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) {
        return null;
      }
      const session = JSON.parse(raw);
      if (!session || !session.token) {
        return null;
      }
      if (session.expires && Date.now() > session.expires) {
        window.localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (error) {
      return null;
    }
  };

  const saveSession = (session) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  };

  const clearSession = () => {
    window.localStorage.removeItem(SESSION_KEY);
  };

  const formatUserLabel = (user) => {
    if (!user) {
      return "";
    }
    return user.charAt(0).toUpperCase() + user.slice(1);
  };

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

  const getLocationParts = (now = new Date()) => ({
    hours: now.getHours(),
    minutes: now.getMinutes(),
    day: now.getDay(),
    date: now.getDate(),
    month: now.getMonth(),
    year: now.getFullYear(),
  });

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

  const setModalOpen = (modal, isOpen) => {
    if (!modal) {
      return;
    }
    modal.classList.toggle("is-open", isOpen);
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  const populateCalendarOptions = (session) => {
    if (!eventCalendar) {
      return;
    }
    eventCalendar.innerHTML = "";
    CALENDAR_OPTIONS.forEach((option) => {
      const entry = document.createElement("option");
      entry.value = option.value;
      entry.textContent = option.label;
      eventCalendar.appendChild(entry);
    });

    if (session && session.role !== "admin" && session.user) {
      eventCalendar.value = CALENDAR_OPTIONS.some((option) => option.value === session.user)
        ? session.user
        : "family";
    } else {
      eventCalendar.value = "family";
    }
  };

  const updateSessionUI = () => {
    const session = loadSession();
    if (userLabel) {
      userLabel.textContent = session ? `Signed in: ${formatUserLabel(session.user)}` : "";
    }
    if (logoutButton) {
      logoutButton.hidden = !session;
    }
    populateCalendarOptions(session);
  };

  const openEventModal = () => {
    if (eventError) {
      eventError.textContent = "";
    }
    if (eventDate && !eventDate.value) {
      eventDate.value = new Date().toISOString().slice(0, 10);
    }
    setModalOpen(eventModal, true);
  };

  const openAddEventFlow = () => {
    const session = loadSession();
    if (!session) {
      pendingAction = "event";
      setModalOpen(loginModal, true);
      return;
    }
    openEventModal();
  };

  const cleanEventTitle = (title, personKey, source) => {
    if (!title) {
      return "";
    }
    if (personKey === "dave" && source === "qgenda") {
      const cleaned = title.replace(/\[[^\]]*\]\s*/g, "").trim();
      return cleaned.slice(0, 8).trimEnd();
    }
    return title.trim();
  };

  const normalizeText = (value) => (value || "").toLowerCase();
  const normalizeCalendarKey = (value) => (value || "").toLowerCase().trim();

  const toCustomEvent = (entry) => {
    if (!entry || !entry.date || !entry.details) {
      return null;
    }
    const timeValue = entry.time ? entry.time : "00:00";
    const start = new Date(`${entry.date}T${timeValue}`);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    return {
      summary: entry.details,
      start,
      allDay: !entry.time,
      calendar: entry.calendar,
      source: "custom",
    };
  };

  const fetchCustomEvents = async (force = false) => {
    const now = Date.now();
    if (!force && now - customEventsCache.fetchedAt < CUSTOM_EVENTS_CACHE_TTL) {
      return customEventsCache.events;
    }
    try {
      const response = await fetch(EVENTS_API_URL, { cache: "no-store" });
      if (!response.ok) {
        return customEventsCache.events;
      }
      const data = await response.json();
      const events = Array.isArray(data.events) ? data.events : [];
      customEventsCache.events = events;
      customEventsCache.fetchedAt = now;
      return events;
    } catch (error) {
      return customEventsCache.events;
    }
  };

  const normalizeCustomEvents = (customEvents) =>
    customEvents
      .map((entry) => {
        const calendarKey = normalizeCalendarKey(entry.calendar);
        const event = toCustomEvent(entry);
        return event && calendarKey ? { ...event, calendarKey } : null;
      })
      .filter(Boolean);

  const parseCalendarDateParts = (entry) => {
    if (!entry || !entry.startDate) {
      return null;
    }
    const [year, month, day] = entry.startDate.split("-").map((value) => Number(value));
    if (!year || !month || !day) {
      return null;
    }
    let hour = 0;
    let minute = 0;
    if (entry.startTime) {
      const [rawHour, rawMinute] = entry.startTime.split(":");
      hour = Number(rawHour);
      minute = Number(rawMinute);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
      }
    }
    return { year, month, day, hour, minute };
  };

  const toCalendarEvent = (entry, source) => {
    const parts = parseCalendarDateParts(entry);
    if (!parts) {
      return null;
    }
    const start = entry.isUtc
      ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute))
      : new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    return {
      ...entry,
      start,
      allDay: entry.allDay != null ? entry.allDay : !entry.startTime,
      source: entry.source || source,
    };
  };

  const fetchCalendarEvents = async (source) => {
    const response = await fetch(`${CALENDAR_API_URL}?source=${encodeURIComponent(source)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Calendar fetch failed");
    }
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.map((entry) => toCalendarEvent(entry, source)).filter(Boolean);
  };

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
    const now = new Date();
    const parts = getLocationParts(now);
    if (timeEl) {
      timeEl.textContent = formatTime(parts);
    }
    if (dateEl) {
      dateEl.textContent = formatDate(parts);
    }
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

  const refreshCalendar = async () => {
    if (!calendarEl) {
      return;
    }

    try {
      const now = new Date();
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

      const customEvents = await fetchCustomEvents();
      const normalizedCustom = normalizeCustomEvents(customEvents);
      const customSchoolEvents = normalizedCustom.filter((event) => event.calendarKey === "school");

      const [letterResult, schoolResult, hockeyResult] = await Promise.allSettled([
        fetchCalendarEvents("letter"),
        fetchCalendarEvents("school"),
        fetchCalendarEvents("hockey"),
      ]);

      let letterDayAvailable = true;
      const letterDayMap = new Map();
      if (letterResult.status === "fulfilled") {
        letterResult.value.forEach((event) => {
          if (event.start < weekStart || event.start >= rangeEnd) {
            return;
          }
          const letter = extractLetterDay(event.summary);
          if (!letter) {
            return;
          }
          letterDayMap.set(dayKey(event.start), letter);
        });
      } else {
        letterDayAvailable = false;
      }

      state.letterDayMap = letterDayMap;

      let schoolEventsAvailable = true;
      const schoolEventsByDay = new Map();
      const upcomingEvents = [];
      if (schoolResult.status === "fulfilled") {
        schoolResult.value.forEach((event) => {
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
      } else {
        schoolEventsAvailable = false;
      }

      const customSchoolByDay = new Map();
      const customUpcoming = [];
      customSchoolEvents.forEach((event) => {
        if (event.start >= nextWeekStart && event.start < upcomingEnd) {
          customUpcoming.push(event);
        }
        if (event.start < weekStart || event.start >= rangeEnd) {
          return;
        }
        const key = dayKey(event.start);
        if (!customSchoolByDay.has(key)) {
          customSchoolByDay.set(key, []);
        }
        customSchoolByDay.get(key).push({ ...event, order: 2 });
      });

      customSchoolByDay.forEach((events, key) => {
        if (!schoolEventsByDay.has(key)) {
          schoolEventsByDay.set(key, []);
        }
        schoolEventsByDay.get(key).push(...events);
      });

      const upcomingCombined = [...upcomingEvents, ...customUpcoming].sort((a, b) => a.start - b.start);
      if (upcomingCombined.length) {
        renderUpcomingEvents(upcomingCombined);
      } else if (!schoolEventsAvailable && upcomingEl) {
        setCalendarStatus(upcomingEl, "Upcoming events unavailable.");
      }

      let hockeyAvailable = true;
      const hockeyEventsByDay = new Map();
      const hockeyDate = getHockeySaturday(now);
      const hockeyKey = dayKey(hockeyDate);
      if (hockeyResult.status === "fulfilled") {
        hockeyResult.value.forEach((event) => {
          const key = dayKey(event.start);
          if (key !== hockeyKey) {
            return;
          }
          if (!hockeyEventsByDay.has(key)) {
            hockeyEventsByDay.set(key, []);
          }
          hockeyEventsByDay.get(key).push(event);
        });
      } else {
        hockeyAvailable = false;
      }

      const schoolAvailable = letterDayAvailable || schoolEventsAvailable || customSchoolByDay.size > 0;

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
      const cleaned = cleanEventTitle(event.summary, personKey, event.source);
      title.textContent = cleaned || "Scheduled event";

      row.appendChild(time);
      row.appendChild(title);
      container.appendChild(row);
    });
  };

  const refreshFamilyCalendars = async (options = {}) => {
    const { forceCustom = false } = options;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    const customEvents = await fetchCustomEvents(forceCustom);
    const normalizedCustom = normalizeCustomEvents(customEvents).filter((event) => {
      if (event.allDay) {
        return event.start >= todayStart && event.start < rangeEnd;
      }
      return event.start >= now && event.start < rangeEnd;
    });

    const customByCalendar = new Map();
    normalizedCustom.forEach((event) => {
      if (!customByCalendar.has(event.calendarKey)) {
        customByCalendar.set(event.calendarKey, []);
      }
      customByCalendar.get(event.calendarKey).push(event);
    });

    const customFor = (calendarKey) =>
      (customByCalendar.get(calendarKey) || []).slice().sort((a, b) => a.start - b.start);

    const todayLetter = state.letterDayMap.get(dayKey(now));
    const studentAddOns = buildStudentAddOnEvents(todayLetter, now);
    if (personLists.has("katherine")) {
      renderPersonEvents("katherine", studentAddOns.katherine);
    }
    if (personLists.has("alistair")) {
      renderPersonEvents("alistair", studentAddOns.alistair);
    }

    if (personLists.has("lorna")) {
      renderPersonEvents("lorna", customFor("lorna"));
    }
    if (personLists.has("family")) {
      renderPersonEvents("family", customFor("family"));
    }

    if (!personLists.has("dave")) {
      return;
    }

    const customDaveEvents = customFor("dave");

    try {
      const todayKey = dayKey(now);
      const events = await fetchCalendarEvents("qgenda");
      const filtered = events.filter((event) => {
        if (event.allDay && dayKey(event.start) === todayKey) {
          return true;
        }
        return event.start >= now && event.start < rangeEnd;
      });

      const combined = [...filtered, ...customDaveEvents].sort((a, b) => a.start - b.start);
      renderPersonEvents("dave", combined);
    } catch (error) {
      if (customDaveEvents.length) {
        renderPersonEvents("dave", customDaveEvents);
      } else {
        setPersonStatus("dave", "Calendar unavailable");
      }
    }
  };


  const setWeatherUnavailable = (message) => {
    if (tempEl) {
      tempEl.textContent = "--°";
    }
    if (conditionEl) {
      conditionEl.textContent = message || "Weather unavailable";
    }
    if (tempRangeEl) {
      tempRangeEl.textContent = "H --° / L --°";
    }
  };

  const fetchWeather = async () => {
    if (!WEATHER_API_KEY) {
      return null;
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

  const getForecastHighLow = (forecast, date = new Date()) => {
    if (!forecast || !Array.isArray(forecast.list)) {
      return null;
    }
    const key = dayKey(date);
    let min = null;
    let max = null;
    forecast.list.forEach((entry) => {
      const entryDate = new Date(entry.dt * 1000);
      if (dayKey(entryDate) !== key) {
        return;
      }
      const minTemp = entry.main && typeof entry.main.temp_min === "number" ? entry.main.temp_min : null;
      const maxTemp = entry.main && typeof entry.main.temp_max === "number" ? entry.main.temp_max : null;
      if (minTemp != null) {
        min = min == null ? minTemp : Math.min(min, minTemp);
      }
      if (maxTemp != null) {
        max = max == null ? maxTemp : Math.max(max, maxTemp);
      }
    });
    if (min == null || max == null) {
      return null;
    }
    return { min, max };
  };

  const applyWeather = (current, forecast) => {
    const description =
      current && current.weather && current.weather[0] && current.weather[0].description
        ? current.weather[0].description
        : null;
    const temp = current && current.main && typeof current.main.temp === "number"
      ? current.main.temp
      : null;

    if (tempEl) {
      tempEl.textContent = temp == null ? "--°" : `${Math.round(temp)}°`;
    }
    if (conditionEl) {
      conditionEl.textContent = description || "Weather unavailable";
    }

    if (tempRangeEl) {
      const forecastRange = getForecastHighLow(forecast, new Date());
      if (forecastRange) {
        tempRangeEl.textContent = `H ${Math.round(forecastRange.max)}° / L ${Math.round(forecastRange.min)}°`;
      } else if (current && current.main) {
        const maxTemp = typeof current.main.temp_max === "number" ? current.main.temp_max : null;
        const minTemp = typeof current.main.temp_min === "number" ? current.main.temp_min : null;
        if (maxTemp != null && minTemp != null) {
          tempRangeEl.textContent = `H ${Math.round(maxTemp)}° / L ${Math.round(minTemp)}°`;
        } else {
          tempRangeEl.textContent = "";
        }
      } else {
        tempRangeEl.textContent = "";
      }
    }
  };

  const refreshWeather = async () => {
    if (!WEATHER_API_KEY) {
      setWeatherUnavailable("Weather unavailable");
      return;
    }
    try {
      const [current, forecast] = await Promise.all([fetchWeather(), fetchForecast()]);
      applyWeather(current, forecast);
    } catch (error) {
      setWeatherUnavailable("Weather unavailable");
    }
  };

  let lastThemePhase = "";

  const getPhaseByHour = (date) => {
    const hour = date.getHours();
    if (hour >= 7 && hour < 17) {
      return "day";
    }
    if (hour >= 17 && hour < 20) {
      return "dusk";
    }
    if (hour >= 5 && hour < 7) {
      return "dawn";
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

  const setSkyColors = (phase) => {
    const palette = paletteForPhase(phase);
    const topBase = hexToRgb(palette.top);
    const bottomBase = hexToRgb(palette.bottom);
    const glowBase = hexToRgb(palette.glow);
    const top = topBase;
    const bottom = bottomBase;
    const glow = glowBase;

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
    let cloudHighlight = cloudHighlightBase;
    let cloudCore = cloudCoreBase;
    let cloudShadow = cloudShadowBase;

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
  };

  const applyTimeTheme = (now = new Date()) => {
    const phase = getPhaseByHour(now);
    if (phase === lastThemePhase) {
      return;
    }
    lastThemePhase = phase;
    setSkyColors(phase);
    if (phase === "night") {
      requestAnimationFrame(() => drawMoon(now));
    }
  };

  const refreshTheme = () => {
    applyTimeTheme(new Date());
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

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const targetId = event.currentTarget.getAttribute("data-close-modal");
      const modal = targetId === "login-modal" ? loginModal : eventModal;
      setModalOpen(modal, false);
      pendingAction = null;
    });
  });

  [loginModal, eventModal].forEach((modal) => {
    if (!modal) {
      return;
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        setModalOpen(modal, false);
        pendingAction = null;
      }
    });
  });

  if (addEventButton) {
    addEventButton.addEventListener("click", openAddEventFlow);
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      clearSession();
      updateSessionUI();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (loginError) {
        loginError.textContent = "";
      }
      const username = loginUsername ? loginUsername.value.trim() : "";
      const password = loginPassword ? loginPassword.value : "";
      if (!username || !password) {
        if (loginError) {
          loginError.textContent = "Enter a username and password.";
        }
        return;
      }
      try {
        const response = await fetch(LOGIN_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (loginError) {
            loginError.textContent = data && data.error ? data.error : "Unable to sign in.";
          }
          return;
        }
        saveSession(data);
        updateSessionUI();
        if (loginForm) {
          loginForm.reset();
        }
        setModalOpen(loginModal, false);
        if (pendingAction === "event") {
          pendingAction = null;
          openEventModal();
        }
      } catch (error) {
        if (loginError) {
          loginError.textContent = "Unable to sign in.";
        }
      }
    });
  }

  if (eventForm) {
    eventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (eventError) {
        eventError.textContent = "";
      }
      const session = loadSession();
      if (!session) {
        pendingAction = "event";
        setModalOpen(eventModal, false);
        setModalOpen(loginModal, true);
        return;
      }
      const payload = {
        date: eventDate ? eventDate.value : "",
        time: eventTime ? eventTime.value : "",
        details: eventDetails ? eventDetails.value.trim() : "",
        calendar: eventCalendar ? eventCalendar.value : "",
      };
      try {
        const response = await fetch(EVENTS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            clearSession();
            updateSessionUI();
            pendingAction = "event";
            setModalOpen(eventModal, false);
            setModalOpen(loginModal, true);
            return;
          }
          if (eventError) {
            eventError.textContent = data && data.error ? data.error : "Unable to save event.";
          }
          return;
        }
        if (eventForm) {
          eventForm.reset();
        }
        setModalOpen(eventModal, false);
        refreshFamilyCalendars({ forceCustom: true });
      } catch (error) {
        if (eventError) {
          eventError.textContent = "Unable to save event.";
        }
      }
    });
  }

  updateSessionUI();

  updateClock();
  refreshTheme();
  setInterval(updateClock, 1000);
  setInterval(refreshTheme, THEME_REFRESH_INTERVAL);
  refreshWeather();
  setInterval(refreshWeather, WEATHER_REFRESH_INTERVAL);
  refreshCalendar();
  setInterval(refreshCalendar, SCHOOL_CALENDAR_REFRESH);
  refreshFamilyCalendars();
  setInterval(refreshFamilyCalendars, FAMILY_CALENDAR_REFRESH);
})();
