(() => {
  const EVENTS_API_URL = "/api/events";
  const CALENDAR_API_URL = "/api/calendar";
  const SETTINGS_API_URL = "/api/calendar-settings";
  const LOGIN_API_URL = "/api/login";
  const SESSION_KEY = "dashboardSession";
  const CALENDAR_HASH = "#calendar";
  const MEALS_HASH = "#meals";
  const DATA_REFRESH_INTERVAL = 10 * 60 * 1000;
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

  const calendarView = document.getElementById("calendar-view");
  const calendarOpenButton = document.getElementById("calendar-open");
  const calendarBack = document.getElementById("calendar-back");
  const calendarModeMonth = document.getElementById("calendar-mode-month");
  const calendarModeYear = document.getElementById("calendar-mode-year");
  const calendarMonthPicker = document.getElementById("calendar-month-picker");
  const calendarYearPicker = document.getElementById("calendar-year-picker");
  const calendarRangeLabel = document.getElementById("calendar-range-label");
  const calendarStatus = document.getElementById("calendar-status");
  const calendarContent = document.getElementById("calendar-content");
  const calendarFilters = document.getElementById("calendar-filters");
  const calendarFiltersForm = document.getElementById("calendar-filters-form");
  const calendarFiltersSave = document.getElementById("calendar-filters-save");
  const calendarFiltersStatus = document.getElementById("calendar-filters-status");
  const calendarLegend = document.getElementById("calendar-legend");
  const dashboardView = document.getElementById("dashboard-view");
  const mealsView = document.getElementById("meals-view");
  const loginModal = document.getElementById("login-modal");

  const eventsChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("dashboard-events")
    : null;

  if (!calendarView || !calendarContent) {
    return;
  }

  const DEFAULT_FILTERS = {
    includeCustom: true,
    includeSources: {
      school: true,
      hockey: true,
      letter: false,
      qgenda: false,
    },
    includeCalendars: {
      family: true,
      dave: true,
      lorna: true,
      school: true,
      meals: false,
    },
    useUpcomingKeywords: true,
    hideDailySchoolDetails: true,
  };

  const state = {
    mode: "year",
    monthDate: new Date(),
    year: new Date().getFullYear(),
    settings: { filters: DEFAULT_FILTERS },
    cachedAt: 0,
    cachedEvents: [],
  };

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

  const setModalOpen = (modal, isOpen) => {
    if (!modal) {
      return;
    }
    modal.classList.toggle("is-open", isOpen);
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  };

  const normalizeText = (value) => (value || "").toLowerCase();

  const matchesUpcomingKeyword = (summary) => {
    const text = normalizeText(summary);
    return UPCOMING_KEYWORDS.some((keyword) => text.includes(keyword));
  };

  const isDailySchoolDetail = (summary) => {
    if (!summary) {
      return false;
    }
    return /(\b[ABCD] Day\b|K\/A:|\bGym\b|\bOrchestra\b|\bLibrary\b|\bChallenge\b|\bK:|\bA:)/i.test(summary);
  };

  const updateLegendFilters = (filters) => {
    if (!calendarLegend || !filters) {
      return;
    }
    const includeSources = filters.includeSources || {};
    const includeCalendars = filters.includeCalendars || {};
    const allow = (value) => value !== false;
    const includeCustom = allow(filters.includeCustom);
    const show = {
      family: includeCustom && allow(includeCalendars.family),
      dave: includeCustom && allow(includeCalendars.dave),
      lorna: includeCustom && allow(includeCalendars.lorna),
      meals: includeCustom && allow(includeCalendars.meals),
      school: allow(includeSources.school) || (includeCustom && allow(includeCalendars.school)),
      hockey: allow(includeSources.hockey),
      qgenda: allow(includeSources.qgenda),
      letter: allow(includeSources.letter),
      summer: allow(includeSources.school),
    };

    calendarLegend.querySelectorAll("[data-legend]").forEach((item) => {
      const key = item.getAttribute("data-legend");
      if (!key) {
        return;
      }
      const isVisible = Object.prototype.hasOwnProperty.call(show, key) ? show[key] : true;
      item.classList.toggle("is-hidden", !isVisible);
    });
  };

  const setLegendVisibility = (mode) => {
    if (!calendarLegend) {
      return;
    }
    calendarLegend.hidden = mode !== "year";
  };

  const dayKey = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatMonthLabel = (date) =>
    date.toLocaleDateString([], { month: "long", year: "numeric" });

  const formatMonthShort = (date) =>
    date.toLocaleDateString([], { month: "short" });

  const formatRangeLabel = (start, end) => {
    if (!start || !end) {
      return "";
    }
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
      return `${start.toLocaleDateString([], { month: "short", day: "numeric" })}-${end.toLocaleDateString([], { day: "numeric" })}`;
    }
    return `${start.toLocaleDateString([], { month: "short", day: "numeric" })}-${end.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  };

  const parseDateTime = (dateValue, timeValue) => {
    if (!dateValue) {
      return null;
    }
    const [year, month, day] = dateValue.split("-").map(Number);
    if (!year || !month || !day) {
      return null;
    }
    let hour = 0;
    let minute = 0;
    if (timeValue) {
      const [rawHour, rawMinute] = timeValue.split(":");
      hour = Number(rawHour);
      minute = Number(rawMinute);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
      }
    }
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  };

  const toCustomEvent = (entry) => {
    if (!entry || !entry.date || !entry.details) {
      return null;
    }
    const start = parseDateTime(entry.date, entry.time);
    if (!start) {
      return null;
    }
    const endDate = entry.endDate || (entry.endTime ? entry.date : "");
    const end = endDate ? parseDateTime(endDate, entry.endTime || "23:59") : start;
    return {
      id: entry.id,
      summary: entry.details,
      start,
      end: end || start,
      source: "custom",
      calendarKey: (entry.calendar || "").toLowerCase(),
    };
  };

  const parseCalendarDateParts = (entry) => {
    if (!entry || !entry.startDate) {
      return null;
    }
    const [year, month, day] = entry.startDate.split("-").map(Number);
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
      summary: entry.summary || "",
      start,
      end: start,
      source: entry.source || source,
    };
  };

  const fetchCustomEvents = async () => {
    const response = await fetch(EVENTS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load events");
    }
    const data = await response.json();
    const entries = Array.isArray(data.events) ? data.events : [];
    return entries.map((entry) => toCustomEvent(entry)).filter(Boolean);
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

  const fetchSettings = async () => {
    const response = await fetch(SETTINGS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Settings fetch failed");
    }
    const data = await response.json();
    return data && data.settings ? data.settings : { filters: DEFAULT_FILTERS };
  };

  const saveSettings = async (filters) => {
    const session = loadSession();
    if (!session || session.role !== "admin") {
      return { ok: false, status: 401 };
    }
    const response = await fetch(SETTINGS_API_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ filters }),
    });
    return response;
  };

  const applyFilters = (events, filters) =>
    events.filter((event) => {
      if (event.source === "custom") {
        if (!filters.includeCustom) {
          return false;
        }
        if (event.calendarKey && Object.prototype.hasOwnProperty.call(filters.includeCalendars, event.calendarKey)) {
          if (!filters.includeCalendars[event.calendarKey]) {
            return false;
          }
        }
        return true;
      }
      if (Object.prototype.hasOwnProperty.call(filters.includeSources, event.source)) {
        if (!filters.includeSources[event.source]) {
          return false;
        }
      }
      if (filters.useUpcomingKeywords && !matchesUpcomingKeyword(event.summary)) {
        return false;
      }
      if (filters.hideDailySchoolDetails && isDailySchoolDetail(event.summary)) {
        return false;
      }
      return true;
    });

  const deriveSummerBreak = (events) => {
    const schoolEvents = events.filter((event) => event.source === "school");
    const lastDay = schoolEvents
      .filter((event) => /last day of school/i.test(event.summary || ""))
      .sort((a, b) => b.start - a.start)[0];
    const firstDay = schoolEvents
      .filter((event) => /first day of school/i.test(event.summary || ""))
      .sort((a, b) => a.start - b.start)[0];
    if (!lastDay || !firstDay) {
      return null;
    }
    const start = new Date(lastDay.start);
    start.setDate(start.getDate() + 1);
    const end = new Date(firstDay.start);
    end.setDate(end.getDate() - 1);
    if (end < start) {
      return null;
    }
    return {
      summary: "Summer Break",
      start,
      end,
      source: "generated",
      category: "summer-break",
    };
  };

  const eventClass = (event) => {
    if (event.category === "summer-break") {
      return "event-summer";
    }
    if (event.source === "custom") {
      if (event.calendarKey === "family") {
        return "event-family";
      }
      if (event.calendarKey === "dave") {
        return "event-dave";
      }
      if (event.calendarKey === "lorna") {
        return "event-lorna";
      }
      if (event.calendarKey === "school") {
        return "event-school";
      }
      if (event.calendarKey === "meals") {
        return "event-meals";
      }
      return "event-custom";
    }
    if (event.source === "school") {
      return "event-school";
    }
    if (event.source === "hockey") {
      return "event-hockey";
    }
    if (event.source === "qgenda") {
      return "event-qgenda";
    }
    if (event.source === "letter") {
      return "event-letter";
    }
    return "event-external";
  };

  const renderMonthView = (events, monthDate) => {
    if (!calendarContent) {
      return;
    }
    calendarContent.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "month-grid";

    const header = document.createElement("div");
    header.className = "month-grid-header";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label) => {
      const cell = document.createElement("div");
      cell.textContent = label;
      header.appendChild(cell);
    });
    calendarContent.appendChild(header);

    const startOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startOfGrid = new Date(startOfMonth);
    startOfGrid.setDate(startOfGrid.getDate() - startOfMonth.getDay());

    for (let i = 0; i < 42; i += 1) {
      const day = new Date(startOfGrid);
      day.setDate(startOfGrid.getDate() + i);
      const dayCell = document.createElement("div");
      dayCell.className = "calendar-day";
      if (day.getMonth() !== monthDate.getMonth()) {
        dayCell.classList.add("is-muted");
      }
      if (dayKey(day) === dayKey(new Date())) {
        dayCell.classList.add("is-today");
      }

      const dayNumber = document.createElement("div");
      dayNumber.className = "calendar-day-number";
      dayNumber.textContent = `${day.getDate()}`;
      dayCell.appendChild(dayNumber);

      const dayEvents = document.createElement("div");
      dayEvents.className = "calendar-day-events";
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const eventsForDay = events.filter((event) => event.start <= dayEnd && event.end >= dayStart);
      const maxEvents = 3;
      eventsForDay.slice(0, maxEvents).forEach((event) => {
        const chip = document.createElement("div");
        chip.className = `calendar-event-chip ${eventClass(event)}`;
        const multiDay = dayKey(event.start) !== dayKey(event.end);
        chip.textContent = `${event.summary || "Event"}${multiDay ? " ->" : ""}`;
        chip.title = multiDay ? `${event.summary} (${formatRangeLabel(event.start, event.end)})` : event.summary;
        dayEvents.appendChild(chip);
      });
      if (eventsForDay.length > maxEvents) {
        const more = document.createElement("div");
        more.className = "calendar-event-more";
        more.textContent = `+${eventsForDay.length - maxEvents} more`;
        dayEvents.appendChild(more);
      }

      dayCell.appendChild(dayEvents);
      grid.appendChild(dayCell);
    }

    calendarContent.appendChild(grid);
  };

  const renderYearView = (events, year) => {
    if (!calendarContent) {
      return;
    }
    calendarContent.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "year-view";

    const ruler = document.createElement("div");
    ruler.className = "year-ruler";
    const rulerLabel = document.createElement("div");
    rulerLabel.className = "year-ruler-label";
    rulerLabel.textContent = "";
    ruler.appendChild(rulerLabel);
    const rulerGrid = document.createElement("div");
    rulerGrid.className = "year-ruler-grid";
    for (let i = 1; i <= 31; i += 1) {
      const mark = document.createElement("div");
      mark.className = "year-ruler-day";
      if (i === 1 || i === 5 || i === 10 || i === 15 || i === 20 || i === 25 || i === 30) {
        mark.textContent = `${i}`;
      }
      rulerGrid.appendChild(mark);
    }
    ruler.appendChild(rulerGrid);
    wrapper.appendChild(ruler);

    for (let month = 0; month < 12; month += 1) {
      const monthDate = new Date(year, month, 1);
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

      const monthRow = document.createElement("div");
      monthRow.className = "year-month-row";

      const label = document.createElement("div");
      label.className = "year-month-label";
      label.textContent = formatMonthShort(monthDate);
      monthRow.appendChild(label);

      const bars = document.createElement("div");
      bars.className = "year-month-bars";

      const segments = [];
      events.forEach((event) => {
        if (event.end < monthStart || event.start > monthEnd) {
          return;
        }
        const segmentStart = new Date(Math.max(event.start.getTime(), monthStart.getTime()));
        const segmentEnd = new Date(Math.min(event.end.getTime(), monthEnd.getTime()));
        const startDay = segmentStart.getDate();
        const endDay = segmentEnd.getDate();
        segments.push({
          event,
          startDay,
          endDay,
        });
      });

      segments.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
      const rows = [];
      segments.forEach((segment) => {
        let rowIndex = rows.findIndex((endDay) => segment.startDay > endDay);
        if (rowIndex === -1) {
          rowIndex = rows.length;
          rows.push(segment.endDay);
        } else {
          rows[rowIndex] = segment.endDay;
        }
        segment.row = rowIndex + 1;
      });

      if (segments.length === 0) {
        const empty = document.createElement("div");
        empty.className = "year-empty";
        empty.textContent = "-";
        bars.appendChild(empty);
      }

      segments.forEach((segment) => {
        const bar = document.createElement("div");
        bar.className = `year-event-bar ${eventClass(segment.event)}`;
        bar.style.gridColumn = `${segment.startDay} / ${segment.endDay + 1}`;
        bar.style.gridRow = `${segment.row}`;
        bar.textContent = segment.event.summary || "Event";
        bar.title = segment.event.summary
          ? `${segment.event.summary} (${formatRangeLabel(segment.event.start, segment.event.end)})`
          : formatRangeLabel(segment.event.start, segment.event.end);
        bars.appendChild(bar);
      });

      bars.style.gridTemplateColumns = "repeat(31, minmax(8px, 1fr))";
      monthRow.appendChild(bars);
      wrapper.appendChild(monthRow);
    }

    calendarContent.appendChild(wrapper);
  };

  const renderView = () => {
    if (!calendarStatus) {
      return;
    }
    calendarStatus.textContent = "";
    const filters = state.settings.filters || DEFAULT_FILTERS;
    updateLegendFilters(filters);
    let events = applyFilters(state.cachedEvents, filters);

    if (filters.includeSources && filters.includeSources.school) {
      const summerBreak = deriveSummerBreak(state.cachedEvents);
      if (summerBreak) {
        events = [...events, summerBreak];
      }
    }

    if (state.mode === "month") {
      if (calendarRangeLabel) {
        calendarRangeLabel.textContent = formatMonthLabel(state.monthDate);
      }
      renderMonthView(events, state.monthDate);
    } else {
      if (calendarRangeLabel) {
        calendarRangeLabel.textContent = `${state.year}`;
      }
      renderYearView(events, state.year);
    }
  };

  const setCalendarMode = (mode) => {
    state.mode = mode;
    setLegendVisibility(mode);
    if (calendarModeMonth) {
      calendarModeMonth.classList.toggle("is-active", mode === "month");
    }
    if (calendarModeYear) {
      calendarModeYear.classList.toggle("is-active", mode === "year");
    }
    if (calendarMonthPicker) {
      calendarMonthPicker.hidden = mode !== "month";
    }
    if (calendarYearPicker) {
      calendarYearPicker.hidden = mode !== "year";
    }
    renderView();
  };

  const setCalendarActive = (isActive) => {
    if (!calendarView) {
      return;
    }
    calendarView.hidden = !isActive;
    calendarView.style.display = isActive ? "flex" : "none";
    if (dashboardView) {
      dashboardView.hidden = isActive;
      dashboardView.style.display = isActive ? "none" : "grid";
    }
    if (mealsView && isActive) {
      mealsView.hidden = true;
      mealsView.style.display = "none";
    }
    document.body.classList.toggle("calendar-active", isActive);
    if (isActive) {
      refreshData(true);
    }
  };

  const syncCalendarFromHash = () => {
    if (window.location.hash === CALENDAR_HASH) {
      setCalendarActive(true);
      return;
    }
    if (window.location.hash === MEALS_HASH) {
      setCalendarActive(false);
      return;
    }
    setCalendarActive(false);
  };

  const refreshData = async (force = false) => {
    const now = Date.now();
    if (!force && now - state.cachedAt < DATA_REFRESH_INTERVAL) {
      renderView();
      return;
    }
    if (calendarStatus) {
      calendarStatus.textContent = "Loading calendar...";
    }
    try {
      const [settings, custom, school, hockey, letter, qgenda] = await Promise.allSettled([
        fetchSettings(),
        fetchCustomEvents(),
        fetchCalendarEvents("school"),
        fetchCalendarEvents("hockey"),
        fetchCalendarEvents("letter"),
        fetchCalendarEvents("qgenda"),
      ]);

      state.settings = settings.status === "fulfilled" ? settings.value : state.settings;

      const merged = []
        .concat(custom.status === "fulfilled" ? custom.value : [])
        .concat(school.status === "fulfilled" ? school.value : [])
        .concat(hockey.status === "fulfilled" ? hockey.value : [])
        .concat(letter.status === "fulfilled" ? letter.value : [])
        .concat(qgenda.status === "fulfilled" ? qgenda.value : []);

      state.cachedEvents = merged;
      state.cachedAt = now;
      if (calendarStatus) {
        calendarStatus.textContent = "";
      }
      updateFilterUI();
      renderView();
    } catch (error) {
      if (calendarStatus) {
        calendarStatus.textContent = "Calendar unavailable.";
      }
    }
  };

  const updateFilterUI = () => {
    if (!calendarFiltersForm || !calendarFilters) {
      return;
    }
    const session = loadSession();
    const isAdmin = session && session.role === "admin";
    calendarFilters.hidden = !isAdmin;
    if (!isAdmin) {
      return;
    }
    const filters = state.settings.filters || DEFAULT_FILTERS;
    calendarFiltersForm.querySelectorAll("input[type='checkbox']").forEach((input) => {
      const key = input.getAttribute("data-filter");
      if (!key) {
        return;
      }
      if (key === "includeCustom") {
        input.checked = Boolean(filters.includeCustom);
      } else if (key === "use-upcoming") {
        input.checked = Boolean(filters.useUpcomingKeywords);
      } else if (key === "hide-daily") {
        input.checked = Boolean(filters.hideDailySchoolDetails);
      } else if (key.startsWith("source-")) {
        const source = key.replace("source-", "");
        input.checked = Boolean(filters.includeSources && filters.includeSources[source]);
      } else if (key.startsWith("calendar-")) {
        const calendar = key.replace("calendar-", "");
        input.checked = Boolean(filters.includeCalendars && filters.includeCalendars[calendar]);
      }
    });
  };

  const collectFiltersFromUI = () => {
    const filters = JSON.parse(JSON.stringify(state.settings.filters || DEFAULT_FILTERS));
    if (!calendarFiltersForm) {
      return filters;
    }
    calendarFiltersForm.querySelectorAll("input[type='checkbox']").forEach((input) => {
      const key = input.getAttribute("data-filter");
      if (!key) {
        return;
      }
      if (key === "includeCustom") {
        filters.includeCustom = input.checked;
      } else if (key === "use-upcoming") {
        filters.useUpcomingKeywords = input.checked;
      } else if (key === "hide-daily") {
        filters.hideDailySchoolDetails = input.checked;
      } else if (key.startsWith("source-")) {
        const source = key.replace("source-", "");
        if (filters.includeSources && Object.prototype.hasOwnProperty.call(filters.includeSources, source)) {
          filters.includeSources[source] = input.checked;
        }
      } else if (key.startsWith("calendar-")) {
        const calendar = key.replace("calendar-", "");
        if (filters.includeCalendars && Object.prototype.hasOwnProperty.call(filters.includeCalendars, calendar)) {
          filters.includeCalendars[calendar] = input.checked;
        }
      }
    });
    return filters;
  };

  if (calendarModeMonth) {
    calendarModeMonth.addEventListener("click", () => setCalendarMode("month"));
  }
  if (calendarModeYear) {
    calendarModeYear.addEventListener("click", () => setCalendarMode("year"));
  }

  if (calendarMonthPicker) {
    const monthValue = `${state.monthDate.getFullYear()}-${String(state.monthDate.getMonth() + 1).padStart(2, "0")}`;
    calendarMonthPicker.value = monthValue;
    calendarMonthPicker.addEventListener("change", () => {
      if (!calendarMonthPicker.value) {
        return;
      }
      const [year, month] = calendarMonthPicker.value.split("-").map(Number);
      if (!year || !month) {
        return;
      }
      state.monthDate = new Date(year, month - 1, 1);
      state.year = year;
      if (calendarYearPicker) {
        calendarYearPicker.value = `${year}`;
      }
      renderView();
    });
  }

  if (calendarYearPicker) {
    calendarYearPicker.value = `${state.year}`;
    calendarYearPicker.addEventListener("change", () => {
      const year = Number(calendarYearPicker.value);
      if (!Number.isFinite(year)) {
        return;
      }
      state.year = year;
      state.monthDate = new Date(year, state.monthDate.getMonth(), 1);
      if (calendarMonthPicker) {
        calendarMonthPicker.value = `${year}-${String(state.monthDate.getMonth() + 1).padStart(2, "0")}`;
      }
      renderView();
    });
  }

  if (calendarFiltersForm) {
    calendarFiltersForm.addEventListener("change", () => {
      state.settings = {
        ...state.settings,
        filters: collectFiltersFromUI(),
      };
      renderView();
    });
  }

  if (calendarFiltersSave) {
    calendarFiltersSave.addEventListener("click", async () => {
      if (!calendarFiltersStatus) {
        return;
      }
      calendarFiltersStatus.textContent = "";
      const session = loadSession();
      if (!session || session.role !== "admin") {
        calendarFiltersStatus.textContent = "Admin access required.";
        setModalOpen(loginModal, true);
        return;
      }
      const nextFilters = collectFiltersFromUI();
      try {
        const response = await saveSettings(nextFilters);
        if (!response.ok) {
          calendarFiltersStatus.textContent = "Unable to save filters.";
          return;
        }
        const data = await response.json();
        state.settings = data && data.settings ? data.settings : state.settings;
        calendarFiltersStatus.textContent = "Filters saved.";
      } catch (error) {
        calendarFiltersStatus.textContent = "Unable to save filters.";
      }
    });
  }

  if (calendarOpenButton) {
    calendarOpenButton.addEventListener("click", () => {
      window.location.hash = CALENDAR_HASH;
    });
  }

  if (calendarBack) {
    calendarBack.addEventListener("click", () => {
      window.location.hash = "";
    });
  }

  if (eventsChannel) {
    eventsChannel.addEventListener("message", (event) => {
      if (!event || !event.data || event.data.type !== "events-updated") {
        return;
      }
      refreshData(true);
    });
  }

  window.addEventListener("hashchange", syncCalendarFromHash);

  setCalendarMode(state.mode);
  syncCalendarFromHash();
  refreshData(true);
  setInterval(refreshData, DATA_REFRESH_INTERVAL);
})();
