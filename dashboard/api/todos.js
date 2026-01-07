const crypto = require("crypto");
const { verifyToken } = require("../lib/auth");
const { query } = require("../lib/db");

const readJsonBody = async (req) => {
  if (req.body) {
    if (typeof req.body === "string") {
      return req.body.trim() ? JSON.parse(req.body) : null;
    }
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8");
      return raw.trim() ? JSON.parse(raw) : null;
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return null;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
};

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

const getAuthSession = (req) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token) {
    return null;
  }
  return verifyToken(token, secret);
};

const parseDateValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
};

const toDateString = (value) => {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const toTimestamp = (value) => {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
};

const rowToTodo = (row) => ({
  id: row.id,
  text: row.text,
  dueDate: toDateString(row.due_date),
  createdBy: row.created_by,
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
  completedAt: row.completed_at ? toTimestamp(row.completed_at) : "",
  completedBy: row.completed_by || "",
});

const listTodos = async () => {
  const result = await query(
    `SELECT id, text, due_date, created_by, created_at, updated_at, completed_at, completed_by
     FROM todos
     ORDER BY created_at ASC`
  );
  return result.rows.map(rowToTodo);
};

const getTodoById = async (id) => {
  const result = await query(
    `SELECT id, text, due_date, created_by, created_at, updated_at, completed_at, completed_by
     FROM todos
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToTodo(result.rows[0]) : null;
};

module.exports = async (req, res) => {
  const debug = getDebugFlag(req);
  if (req.method === "GET") {
    try {
      const todos = await listTodos();
      return sendJson(res, 200, { todos });
    } catch (error) {
      console.error("[todos] load failed", error);
      return sendError(res, 500, "Unable to load todos", error, debug);
    }
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    console.error("[todos] invalid json", error);
    return sendError(res, 400, "Invalid JSON", error, debug);
  }

  const session = getAuthSession(req);
  if (!session) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const text = body && typeof body.text === "string" ? body.text.trim() : "";
    const dueDateInput = body && body.dueDate;
    const dueDate = parseDateValue(dueDateInput);

    if (!text) {
      return sendJson(res, 400, { error: "Missing task" });
    }
    if (typeof dueDateInput === "string" && dueDateInput.trim() && !dueDate) {
      return sendJson(res, 400, { error: "Invalid due date" });
    }

    const now = new Date().toISOString();
    const todo = {
      id: crypto.randomUUID(),
      text,
      dueDate: dueDate || "",
      createdBy: session.user,
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      completedBy: "",
    };

    try {
      await query(
        `INSERT INTO todos (
          id, text, due_date, created_by, created_at, updated_at, completed_at, completed_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )`,
        [
          todo.id,
          todo.text,
          todo.dueDate || null,
          todo.createdBy,
          todo.createdAt,
          todo.updatedAt,
          null,
          null,
        ]
      );
      return sendJson(res, 200, { todo });
    } catch (error) {
      console.error("[todos] save failed", error);
      return sendError(res, 500, "Unable to save todo", error, debug);
    }
  }

  if (req.method === "PATCH") {
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing todo id" });
    }

    const textProvided = body && Object.prototype.hasOwnProperty.call(body, "text");
    const dueDateProvided = body && Object.prototype.hasOwnProperty.call(body, "dueDate");
    const completedProvided = body && Object.prototype.hasOwnProperty.call(body, "completed");
    const updates = {
      text: textProvided && typeof body.text === "string" ? body.text.trim() : null,
      dueDate: dueDateProvided ? parseDateValue(body.dueDate) : null,
      completed: completedProvided ? Boolean(body.completed) : null,
    };

    if (textProvided && !updates.text) {
      return sendJson(res, 400, { error: "Missing task" });
    }
    if (dueDateProvided && typeof body.dueDate === "string" && body.dueDate.trim() && !updates.dueDate) {
      return sendJson(res, 400, { error: "Invalid due date" });
    }

    try {
      const existing = await getTodoById(id);
      if (!existing) {
        return sendJson(res, 404, { error: "Todo not found" });
      }
      const next = {
        ...existing,
        text: updates.text !== null ? updates.text : existing.text,
        dueDate: updates.dueDate !== null ? updates.dueDate : existing.dueDate,
        updatedAt: new Date().toISOString(),
      };

      if (updates.completed !== null) {
        if (updates.completed) {
          next.completedAt = new Date().toISOString();
          next.completedBy = session.user;
        } else {
          next.completedAt = "";
          next.completedBy = "";
        }
      }

      const result = await query(
        `UPDATE todos
         SET text = $1,
             due_date = $2,
             updated_at = $3,
             completed_at = $4,
             completed_by = $5
         WHERE id = $6
         RETURNING id, text, due_date, created_by, created_at, updated_at, completed_at, completed_by`,
        [
          next.text,
          next.dueDate || null,
          next.updatedAt,
          next.completedAt ? next.completedAt : null,
          next.completedBy || null,
          next.id,
        ]
      );
      const updated = result.rows[0] ? rowToTodo(result.rows[0]) : next;
      return sendJson(res, 200, { todo: updated });
    } catch (error) {
      console.error("[todos] update failed", error);
      return sendError(res, 500, "Unable to update todo", error, debug);
    }
  }

  if (req.method === "DELETE") {
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing todo id" });
    }
    try {
      const existing = await getTodoById(id);
      if (!existing) {
        return sendJson(res, 404, { error: "Todo not found" });
      }
      await query("DELETE FROM todos WHERE id = $1", [id]);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      console.error("[todos] delete failed", error);
      return sendError(res, 500, "Unable to delete todo", error, debug);
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return sendJson(res, 405, { error: "Method not allowed" });
};
