(() => {
  const EVENTS_API_URL = "/api/events";
  const MEALS_REFRESH_INTERVAL = 30 * 60 * 1000;
  const MEALS_HASH = "#meals";

  const mealPreviewButton = document.getElementById("meal-preview");
  const mealPreviewTitle = document.getElementById("meal-preview-title");
  const mealsView = document.getElementById("meals-view");
  const mealsList = document.getElementById("meals-list");
  const mealsWeek = document.getElementById("meals-week");
  const mealsBack = document.getElementById("meals-back");
  const dashboardView = document.getElementById("dashboard-view");
  const eventsChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("dashboard-events")
    : null;

  if (!mealPreviewButton || !mealsView || !mealsList || !mealsWeek || !dashboardView) {
    return;
  }

  const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const pad2 = (value) => `${value}`.padStart(2, "0");

  const getLocalDateKey = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  const parseTimeLabel = (dateKey, timeValue) => {
    if (!timeValue) {
      return "";
    }
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
      return "";
    }
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const normalizeMealTitle = (value) => (value && value.trim() ? value.trim() : "Meal");

  const fetchMeals = async () => {
    const response = await fetch(EVENTS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load meals");
    }
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events
      .filter((event) => (event.calendar || "").toLowerCase() === "meals")
      .map((event) => ({
        startDate: event.date || "",
        startTime: event.time || "",
        summary: event.details || "",
      }))
      .filter((event) => event.startDate && event.summary);
  };

  const buildWeekRangeLabel = (startDate) => {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    const startLabel = `${SHORT_MONTH_NAMES[startDate.getMonth()]} ${startDate.getDate()}`;
    const endLabel = `${SHORT_MONTH_NAMES[endDate.getMonth()]} ${endDate.getDate()}`;
    return `Week of ${startLabel} - ${endLabel}`;
  };

  const buildMealDayLabel = (date) =>
    `${SHORT_DAY_NAMES[date.getDay()]} · ${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;

  const renderMeals = (events) => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);

    const dayKeys = [];
    const dayDates = [];
    const byDate = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const key = getLocalDateKey(date);
      dayKeys.push(key);
      dayDates.push(date);
      byDate.set(key, []);
    }

    events.forEach((event) => {
      if (!event || !event.startDate) {
        return;
      }
      const list = byDate.get(event.startDate);
      if (list) {
        list.push(event);
      }
    });

    dayKeys.forEach((key) => {
      const list = byDate.get(key);
      if (list) {
        list.sort((a, b) => `${a.startTime || ""}`.localeCompare(`${b.startTime || ""}`));
      }
    });

    const todaysMeals = byDate.get(todayKey) || [];
    if (mealPreviewTitle) {
      if (todaysMeals.length === 0) {
        mealPreviewTitle.textContent = "No dinner planned";
      } else {
        const first = normalizeMealTitle(todaysMeals[0].summary);
        const suffix = todaysMeals.length > 1 ? ` +${todaysMeals.length - 1} more` : "";
        mealPreviewTitle.textContent = `${first}${suffix}`;
      }
    }

    mealsWeek.textContent = buildWeekRangeLabel(today);
    mealsList.innerHTML = "";

    dayKeys.forEach((key, index) => {
      const row = document.createElement("div");
      row.className = "meal-row";

      const day = document.createElement("div");
      day.className = "meal-day";
      day.textContent = buildMealDayLabel(dayDates[index]);

      const details = document.createElement("div");
      details.className = "meal-details";
      const list = byDate.get(key) || [];
      if (!list.length) {
        details.textContent = "—";
      } else {
        list.forEach((event) => {
          const item = document.createElement("div");
          item.className = "meal-item";
          const title = normalizeMealTitle(event.summary);
          const timeLabel = parseTimeLabel(key, event.startTime || "");
          if (timeLabel) {
            const timeEl = document.createElement("span");
            timeEl.className = "meal-time";
            timeEl.textContent = timeLabel;
            const nameEl = document.createElement("span");
            nameEl.className = "meal-name";
            nameEl.textContent = title;
            item.appendChild(timeEl);
            item.appendChild(nameEl);
          } else {
            item.textContent = title;
          }
          details.appendChild(item);
        });
      }

      row.appendChild(day);
      row.appendChild(details);
      mealsList.appendChild(row);
    });
  };

  const renderMealsError = (message) => {
    if (mealPreviewTitle) {
      mealPreviewTitle.textContent = message;
    }
    mealsWeek.textContent = "Meal plan";
    mealsList.innerHTML = `<div class="calendar-status">${message}</div>`;
  };

  const refreshMeals = async () => {
    try {
      const events = await fetchMeals();
      renderMeals(events);
    } catch (error) {
      renderMealsError("Meal plan unavailable");
    }
  };

  const setView = (view) => {
    const showMeals = view === "meals";
    mealsView.hidden = !showMeals;
    dashboardView.hidden = showMeals;
    mealsView.style.display = showMeals ? "flex" : "none";
    dashboardView.style.display = showMeals ? "none" : "grid";
    document.body.classList.toggle("meals-active", showMeals);
    if (showMeals) {
      refreshMeals();
    }
  };

  const syncViewFromHash = () => {
    if (window.location.hash === MEALS_HASH) {
      setView("meals");
    } else {
      setView("dashboard");
    }
  };

  mealPreviewButton.addEventListener("click", () => {
    setView("meals");
    window.location.hash = MEALS_HASH;
  });

  if (mealsBack) {
    mealsBack.addEventListener("click", () => {
      setView("dashboard");
      window.location.hash = "";
    });
  }

  window.addEventListener("hashchange", syncViewFromHash);
  if (eventsChannel) {
    eventsChannel.addEventListener("message", (event) => {
      if (!event || !event.data || event.data.type !== "events-updated") {
        return;
      }
      refreshMeals();
    });
  }

  syncViewFromHash();
  refreshMeals();
  setInterval(refreshMeals, MEALS_REFRESH_INTERVAL);
})();
