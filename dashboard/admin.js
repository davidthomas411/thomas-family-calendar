(() => {
  const EVENTS_API_URL = "/api/events";
  const LOGIN_API_URL = "/api/login";
  const SESSION_KEY = "dashboardSession";
  const CALENDAR_OPTIONS = [
    { value: "family", label: "Family" },
    { value: "school", label: "School" },
    { value: "dave", label: "Dave" },
    { value: "lorna", label: "Lorna" },
    { value: "meals", label: "Meals" },
  ];

  const loginSection = document.getElementById("admin-login");
  const panelSection = document.getElementById("admin-panel");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const usernameEl = document.getElementById("admin-username");
  const passwordEl = document.getElementById("admin-password");
  const eventsEl = document.getElementById("admin-events");
  const emptyEl = document.getElementById("admin-empty");
  const statusEl = document.getElementById("admin-status");
  const refreshBtn = document.getElementById("admin-refresh");
  const logoutBtn = document.getElementById("admin-logout");
  const eventsChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("dashboard-events")
    : null;

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

  const setStatus = (message, isError) => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  };

  const setLoginError = (message) => {
    if (!loginError) {
      return;
    }
    loginError.textContent = message || "";
  };

  const updateUI = () => {
    const session = loadSession();
    const isAdmin = session && session.role === "admin";
    if (loginSection) {
      loginSection.hidden = isAdmin;
    }
    if (panelSection) {
      panelSection.hidden = !isAdmin;
    }
    if (!isAdmin) {
      setStatus("");
    }
  };

  const formatTimestamp = (value) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const fetchEvents = async () => {
    const response = await fetch(EVENTS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to fetch events");
    }
    const data = await response.json();
    return Array.isArray(data.events) ? data.events : [];
  };

  const authFetch = async (method, payload) => {
    const session = loadSession();
    if (!session) {
      throw new Error("Unauthorized");
    }
    return fetch(EVENTS_API_URL, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });
  };

  const buildCalendarSelect = (selected) => {
    const select = document.createElement("select");
    CALENDAR_OPTIONS.forEach((option) => {
      const entry = document.createElement("option");
      entry.value = option.value;
      entry.textContent = option.label;
      select.appendChild(entry);
    });
    select.value = selected || "family";
    return select;
  };

  const renderEvents = (events) => {
    if (!eventsEl) {
      return;
    }
    eventsEl.innerHTML = "";
    if (!events.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
      }
      return;
    }
    if (emptyEl) {
      emptyEl.hidden = true;
    }

    const sorted = events.slice().sort((a, b) => {
      const dateA = `${a.date || ""} ${a.time || ""}`.trim();
      const dateB = `${b.date || ""} ${b.time || ""}`.trim();
      return dateA.localeCompare(dateB);
    });

    sorted.forEach((event) => {
      const card = document.createElement("div");
      card.className = "admin-event";

      const meta = document.createElement("div");
      meta.className = "admin-meta";
      const created = formatTimestamp(event.createdAt);
      meta.textContent = created ? `Created by ${event.createdBy || "unknown"} · ${created}` : "";
      card.appendChild(meta);

      const fields = document.createElement("div");
      fields.className = "admin-event-fields";

      const calendarField = document.createElement("label");
      calendarField.className = "field";
      const calendarLabel = document.createElement("span");
      calendarLabel.textContent = "Calendar";
      const calendarSelect = buildCalendarSelect(event.calendar);
      calendarField.appendChild(calendarLabel);
      calendarField.appendChild(calendarSelect);

      const dateField = document.createElement("label");
      dateField.className = "field";
      const dateLabel = document.createElement("span");
      dateLabel.textContent = "Date";
      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = event.date || "";
      dateField.appendChild(dateLabel);
      dateField.appendChild(dateInput);

      const timeField = document.createElement("label");
      timeField.className = "field";
      const timeLabel = document.createElement("span");
      timeLabel.textContent = "Time";
      const timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.value = event.time || "";
      timeField.appendChild(timeLabel);
      timeField.appendChild(timeInput);

      const detailsField = document.createElement("label");
      detailsField.className = "field";
      const detailsLabel = document.createElement("span");
      detailsLabel.textContent = "Details";
      const detailsInput = document.createElement("input");
      detailsInput.type = "text";
      detailsInput.value = event.details || "";
      detailsField.appendChild(detailsLabel);
      detailsField.appendChild(detailsInput);

      fields.appendChild(calendarField);
      fields.appendChild(dateField);
      fields.appendChild(timeField);
      fields.appendChild(detailsField);

      card.appendChild(fields);

      const actions = document.createElement("div");
      actions.className = "admin-event-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "action-button";
      saveBtn.textContent = "Save";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "text-button";
      deleteBtn.textContent = "Delete";

      saveBtn.addEventListener("click", async () => {
        setStatus("");
        const payload = {
          id: event.id,
          calendar: calendarSelect.value,
          date: dateInput.value,
          time: timeInput.value,
          details: detailsInput.value.trim(),
        };
        try {
          const response = await authFetch("PATCH", payload);
          const data = await response.json();
          if (!response.ok) {
            if (response.status === 401) {
              clearSession();
              updateUI();
              return;
            }
            setStatus(data && data.error ? data.error : "Unable to save event.", true);
            return;
          }
          setStatus("Event saved.");
          if (eventsChannel) {
            eventsChannel.postMessage({ type: "events-updated" });
          }
        } catch (error) {
          setStatus("Unable to save event.", true);
        }
      });

      deleteBtn.addEventListener("click", async () => {
        setStatus("");
        const confirmed = window.confirm("Delete this event?");
        if (!confirmed) {
          return;
        }
        try {
          const response = await authFetch("DELETE", { id: event.id });
          const data = await response.json();
          if (!response.ok) {
            if (response.status === 401) {
              clearSession();
              updateUI();
              return;
            }
            setStatus(data && data.error ? data.error : "Unable to delete event.", true);
            return;
          }
          card.remove();
          if (eventsEl && emptyEl && eventsEl.children.length === 0) {
            emptyEl.hidden = false;
          }
          setStatus("Event deleted.");
          if (eventsChannel) {
            eventsChannel.postMessage({ type: "events-updated" });
          }
        } catch (error) {
          setStatus("Unable to delete event.", true);
        }
      });

      actions.appendChild(saveBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(actions);
      eventsEl.appendChild(card);
    });
  };

  const loadAndRender = async () => {
    setStatus("");
    try {
      const events = await fetchEvents();
      renderEvents(events);
    } catch (error) {
      setStatus("Unable to load events.", true);
    }
  };

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginError("");
      const username = usernameEl ? usernameEl.value.trim() : "";
      const password = passwordEl ? passwordEl.value : "";
      if (!username || !password) {
        setLoginError("Enter a username and password.");
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
          setLoginError(data && data.error ? data.error : "Unable to sign in.");
          return;
        }
        if (data.role !== "admin") {
          setLoginError("Admin access required.");
          return;
        }
        saveSession(data);
        loginForm.reset();
        updateUI();
        loadAndRender();
      } catch (error) {
        setLoginError("Unable to sign in.");
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadAndRender);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      updateUI();
    });
  }

  updateUI();
  const initialSession = loadSession();
  if (initialSession && initialSession.role === "admin") {
    loadAndRender();
  }
})();
