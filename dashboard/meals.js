(() => {
  const EVENTS_API_URL = "/api/events";
  const MEALS_REFRESH_INTERVAL = 30 * 60 * 1000;
  const MEALS_HASH = "#meals";
  const CALENDAR_HASH = "#calendar";
  const SESSION_KEY = "dashboardSession";

  const mealPreviewButton = document.getElementById("meal-preview");
  const mealPreviewTitle = document.getElementById("meal-preview-title");
  const mealsView = document.getElementById("meals-view");
  const mealsList = document.getElementById("meals-list");
  const mealsWeekLabel = document.getElementById("meals-week-label");
  const mealsWeekPicker = document.getElementById("meals-week-picker");
  const mealsStatus = document.getElementById("meals-status");
  const mealsBack = document.getElementById("meals-back");
  const loginModal = document.getElementById("login-modal");
  const dashboardView = document.getElementById("dashboard-view");
  const eventsChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("dashboard-events")
    : null;

  if (!mealPreviewButton || !mealsView || !mealsList || !mealsWeekLabel || !dashboardView) {
    return;
  }

  const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const pad2 = (value) => `${value}`.padStart(2, "0");

  const getLocalDateKey = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  const startOfWeek = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    return start;
  };

  const state = {
    weekStart: startOfWeek(new Date()),
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

  const setMealsStatus = (message, isError = false) => {
    if (!mealsStatus) {
      return;
    }
    mealsStatus.textContent = message || "";
    mealsStatus.classList.toggle("is-error", Boolean(isError));
  };

  const openLoginModal = () => {
    if (!loginModal) {
      return;
    }
    loginModal.classList.add("is-open");
    loginModal.setAttribute("aria-hidden", "false");
  };

  const normalizeMealTitle = (value) => (value && value.trim() ? value.trim() : "");

  const fetchMeals = async () => {
    const response = await fetch(EVENTS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load meals");
    }
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];
    return events.filter((event) => (event.calendar || "").toLowerCase() === "meals");
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

  const saveMeal = async (dateKey, input) => {
    const value = normalizeMealTitle(input.value);
    const previous = input.dataset.originalValue || "";
    const mealId = input.dataset.mealId || "";

    if (value === previous) {
      return;
    }

    const session = loadSession();
    if (!session) {
      setMealsStatus("Sign in to update meals.", true);
      openLoginModal();
      input.value = previous;
      return;
    }

    setMealsStatus("Saving...");

    try {
      if (!value && mealId) {
        const response = await fetch(EVENTS_API_URL, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ id: mealId }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMealsStatus(data && data.error ? data.error : "Unable to delete meal.", true);
          return;
        }
        input.dataset.mealId = "";
        input.dataset.originalValue = "";
      } else if (value && mealId) {
        const response = await fetch(EVENTS_API_URL, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ id: mealId, details: value }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMealsStatus(data && data.error ? data.error : "Unable to update meal.", true);
          return;
        }
        input.dataset.originalValue = value;
      } else if (value && !mealId) {
        const response = await fetch(EVENTS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({
            date: dateKey,
            time: "",
            details: value,
            calendar: "meals",
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMealsStatus(data && data.error ? data.error : "Unable to save meal.", true);
          return;
        }
        input.dataset.mealId = data && data.event ? data.event.id : "";
        input.dataset.originalValue = value;
      }

      setMealsStatus("Saved.");
      if (eventsChannel) {
        eventsChannel.postMessage({ type: "events-updated" });
      }
      refreshMeals();
    } catch (error) {
      setMealsStatus("Unable to save meal.", true);
    }
  };

  const renderMeals = (events) => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const weekStart = state.weekStart;

    const dayKeys = [];
    const dayDates = [];
    const byDate = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + offset);
      const key = getLocalDateKey(date);
      dayKeys.push(key);
      dayDates.push(date);
      byDate.set(key, []);
    }

    events.forEach((event) => {
      if (!event || !event.date) {
        return;
      }
      const list = byDate.get(event.date);
      if (list) {
        list.push(event);
      }
    });

    dayKeys.forEach((key) => {
      const list = byDate.get(key);
      if (list) {
        list.sort((a, b) => `${a.time || ""}`.localeCompare(`${b.time || ""}`));
      }
    });

    const todaysMeals = byDate.get(todayKey) || [];
    if (mealPreviewTitle) {
      if (todaysMeals.length === 0) {
        mealPreviewTitle.textContent = "No dinner planned";
      } else {
        const first = normalizeMealTitle(todaysMeals[0].details);
        const suffix = todaysMeals.length > 1 ? ` +${todaysMeals.length - 1} more` : "";
        mealPreviewTitle.textContent = `${first}${suffix}`;
      }
    }

    mealsWeekLabel.textContent = buildWeekRangeLabel(weekStart);
    if (mealsWeekPicker) {
      mealsWeekPicker.value = getLocalDateKey(weekStart);
    }

    mealsList.innerHTML = "";

    dayKeys.forEach((key, index) => {
      const row = document.createElement("div");
      row.className = "meal-row";
      row.dataset.mealDate = key;

      const day = document.createElement("div");
      day.className = "meal-day";
      day.textContent = buildMealDayLabel(dayDates[index]);

      const details = document.createElement("div");
      details.className = "meal-details";

      const existing = (byDate.get(key) || [])[0];
      const input = document.createElement("input");
      input.type = "text";
      input.className = "meal-input";
      input.placeholder = index === 0 ? "Click to add meal" : "—";
      input.value = existing ? normalizeMealTitle(existing.details) : "";
      input.dataset.mealId = existing && existing.id ? existing.id : "";
      input.dataset.originalValue = input.value;

      input.addEventListener("blur", () => {
        saveMeal(key, input);
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });

      details.appendChild(input);
      row.appendChild(day);
      row.appendChild(details);
      mealsList.appendChild(row);
    });
  };

  const renderMealsError = (message) => {
    if (mealPreviewTitle) {
      mealPreviewTitle.textContent = message;
    }
    mealsWeekLabel.textContent = "Meal plan";
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
      setMealsStatus("");
      refreshMeals();
    }
  };

  const syncViewFromHash = () => {
    const hash = window.location.hash;
    if (hash === MEALS_HASH) {
      setView("meals");
      return;
    }
    if (hash === CALENDAR_HASH) {
      return;
    }
    setView("dashboard");
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

  if (mealsWeekPicker) {
    mealsWeekPicker.addEventListener("change", () => {
      if (!mealsWeekPicker.value) {
        return;
      }
      const selected = new Date(`${mealsWeekPicker.value}T00:00:00`);
      if (Number.isNaN(selected.getTime())) {
        return;
      }
      state.weekStart = startOfWeek(selected);
      refreshMeals();
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
