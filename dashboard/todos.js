(() => {
  const TODOS_API_URL = "/api/todos";
  const SESSION_KEY = "dashboardSession";
  const TODOS_REFRESH_INTERVAL = 2 * 60 * 1000;

  const todoList = document.getElementById("todo-list");
  const todoLatest = document.getElementById("todo-latest");
  const todoAddButton = document.getElementById("todo-add");
  const todoModal = document.getElementById("todo-modal");
  const todoForm = document.getElementById("todo-form");
  const todoText = document.getElementById("todo-text");
  const todoDueDate = document.getElementById("todo-due-date");
  const todoError = document.getElementById("todo-error");
  const loginModal = document.getElementById("login-modal");

  const todosChannel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("dashboard-todos")
    : null;

  if (!todoList) {
    return;
  }

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

  const formatDate = (value) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  };

  const formatDueDate = (value) => {
    if (!value) {
      return "";
    }
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      return value;
    }
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const sortIncomplete = (items) =>
    items.slice().sort((a, b) => {
      const dueA = a.dueDate || "";
      const dueB = b.dueDate || "";
      if (dueA && dueB && dueA !== dueB) {
        return dueA.localeCompare(dueB);
      }
      if (dueA && !dueB) {
        return -1;
      }
      if (!dueA && dueB) {
        return 1;
      }
      const createdA = a.createdAt || "";
      const createdB = b.createdAt || "";
      return createdB.localeCompare(createdA);
    });

  const sortCompleted = (items) =>
    items.slice().sort((a, b) => {
      const doneA = a.completedAt || "";
      const doneB = b.completedAt || "";
      return doneB.localeCompare(doneA);
    });

  const renderTodoItem = (todo, { highlight = false } = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "todo-item";
    if (highlight) {
      button.classList.add("is-highlight");
    }
    const completed = Boolean(todo.completedAt);
    button.classList.toggle("is-complete", completed);
    button.setAttribute("aria-pressed", completed ? "true" : "false");
    button.dataset.todoId = todo.id;

    const title = document.createElement("div");
    title.className = "todo-title";
    const completedLabel = completed ? ` [${formatDate(todo.completedAt)}]` : "";
    title.textContent = `${todo.text || "Task"}${completedLabel}`;

    button.appendChild(title);

    if (!completed && todo.dueDate) {
      const meta = document.createElement("div");
      meta.className = "todo-meta";
      meta.textContent = `Due ${formatDueDate(todo.dueDate)}`;
      button.appendChild(meta);
    }

    button.addEventListener("click", () => toggleTodo(todo));
    return button;
  };

  const renderTodos = (todos) => {
    if (!todoList) {
      return;
    }

    todoList.innerHTML = "";

    if (!Array.isArray(todos) || todos.length === 0) {
      const empty = document.createElement("div");
      empty.className = "calendar-status";
      empty.textContent = "No tasks yet.";
      todoList.appendChild(empty);
      if (todoLatest) {
        todoLatest.hidden = true;
      }
      return;
    }

    const completed = sortCompleted(todos.filter((todo) => todo.completedAt));
    const latestCompleted = completed[0] || null;
    const remainingCompleted = latestCompleted ? completed.slice(1) : completed;
    const incomplete = sortIncomplete(todos.filter((todo) => !todo.completedAt));

    if (todoLatest) {
      todoLatest.innerHTML = "";
      if (latestCompleted) {
        todoLatest.hidden = false;
        todoLatest.appendChild(renderTodoItem(latestCompleted, { highlight: true }));
      } else {
        todoLatest.hidden = true;
      }
    }

    [...incomplete, ...remainingCompleted].forEach((todo) => {
      todoList.appendChild(renderTodoItem(todo));
    });
  };

  const fetchTodos = async () => {
    const response = await fetch(TODOS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load todos");
    }
    const data = await response.json();
    return Array.isArray(data.todos) ? data.todos : [];
  };

  const refreshTodos = async () => {
    try {
      const todos = await fetchTodos();
      renderTodos(todos);
    } catch (error) {
      if (todoList) {
        todoList.innerHTML = "";
        const status = document.createElement("div");
        status.className = "calendar-status";
        status.textContent = "Todo list unavailable.";
        todoList.appendChild(status);
      }
    }
  };

  const authFetch = async (method, payload) => {
    const session = loadSession();
    if (!session) {
      return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
    }
    return fetch(TODOS_API_URL, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });
  };

  const toggleTodo = async (todo) => {
    const session = loadSession();
    if (!session) {
      setModalOpen(loginModal, true);
      return;
    }
    try {
      const response = await authFetch("PATCH", {
        id: todo.id,
        completed: !todo.completedAt,
      });
      if (response.status === 401) {
        setModalOpen(loginModal, true);
        return;
      }
      if (!response.ok) {
        return;
      }
      refreshTodos();
      if (todosChannel) {
        todosChannel.postMessage({ type: "todos-updated" });
      }
    } catch (error) {
      // Ignore toggle errors for now.
    }
  };

  if (todoAddButton) {
    todoAddButton.addEventListener("click", () => {
      const session = loadSession();
      if (!session) {
        setModalOpen(loginModal, true);
        return;
      }
      if (todoForm) {
        todoForm.reset();
      }
      if (todoError) {
        todoError.textContent = "";
      }
      setModalOpen(todoModal, true);
      if (todoText) {
        todoText.focus();
      }
    });
  }

  if (todoForm) {
    todoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (todoError) {
        todoError.textContent = "";
      }
      const session = loadSession();
      if (!session) {
        setModalOpen(todoModal, false);
        setModalOpen(loginModal, true);
        return;
      }
      const payload = {
        text: todoText ? todoText.value.trim() : "",
        dueDate: todoDueDate ? todoDueDate.value : "",
      };
      if (!payload.text) {
        if (todoError) {
          todoError.textContent = "Enter a task.";
        }
        return;
      }
      try {
        const response = await authFetch("POST", payload);
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            setModalOpen(todoModal, false);
            setModalOpen(loginModal, true);
            return;
          }
          if (todoError) {
            todoError.textContent = data && data.error ? data.error : "Unable to save task.";
          }
          return;
        }
        if (todoForm) {
          todoForm.reset();
        }
        setModalOpen(todoModal, false);
        refreshTodos();
        if (todosChannel) {
          todosChannel.postMessage({ type: "todos-updated" });
        }
      } catch (error) {
        if (todoError) {
          todoError.textContent = "Unable to save task.";
        }
      }
    });
  }

  if (todosChannel) {
    todosChannel.addEventListener("message", (event) => {
      if (!event || !event.data || event.data.type !== "todos-updated") {
        return;
      }
      refreshTodos();
    });
  }

  refreshTodos();
  setInterval(refreshTodos, TODOS_REFRESH_INTERVAL);
})();
