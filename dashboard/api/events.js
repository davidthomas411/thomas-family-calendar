const crypto = require("crypto");
const { normalizeUser, parseUserList, verifyToken } = require("../lib/auth");
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
};

const parseTimeValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
};

const normalizeCalendar = (value) => normalizeUser(value);

const DEFAULT_CALENDARS = ["family", "school", "dave", "lorna", "meals"];

const parseCalendarList = (value) => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => normalizeUser(entry))
    .filter(Boolean);
};

const buildAllowedCalendars = () => {
  const familyUsers = parseUserList(process.env.FAMILY_USERS);
  const calendars = new Set(DEFAULT_CALENDARS);
  familyUsers.forEach((_pass, user) => calendars.add(user));
  parseCalendarList(process.env.FAMILY_CALENDARS).forEach((calendar) => calendars.add(calendar));
  return calendars;
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

const toTimeString = (value) => {
  if (!value) {
    return "";
  }
  return String(value).slice(0, 5);
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

const rowToEvent = (row) => ({
  id: row.id,
  calendar: row.calendar,
  details: row.details,
  date: toDateString(row.date),
  time: toTimeString(row.time),
  endDate: toDateString(row.end_date),
  endTime: toTimeString(row.end_time),
  allDay: Boolean(row.all_day),
  createdBy: row.created_by,
  createdAt: toTimestamp(row.created_at),
  updatedAt: toTimestamp(row.updated_at),
});

const listEvents = async () => {
  const result = await query(
    `SELECT id, calendar, details, date, time, end_date, end_time, all_day,
            created_by, created_at, updated_at
     FROM events
     ORDER BY date ASC, time ASC NULLS LAST, created_at ASC`
  );
  return result.rows.map(rowToEvent);
};

const getEventById = async (id) => {
  const result = await query(
    `SELECT id, calendar, details, date, time, end_date, end_time, all_day,
            created_by, created_at, updated_at
     FROM events
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToEvent(result.rows[0]) : null;
};

module.exports = async (req, res) => {
  const debug = getDebugFlag(req);
  if (req.method === "GET") {
    try {
      const events = await listEvents();
      return sendJson(res, 200, { events });
    } catch (error) {
      console.error("[events] load failed", error);
      return sendError(res, 500, "Unable to load events", error, debug);
    }
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    console.error("[events] invalid json", error);
    return sendError(res, 400, "Invalid JSON", error, debug);
  }

  const session = getAuthSession(req);
  if (!session) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const details = body && typeof body.details === "string" ? body.details.trim() : "";
    const dateInput = body && body.date;
    const date = parseDateValue(dateInput);
    const timeInput = body && body.time;
    const time = parseTimeValue(timeInput);
    const endDateInput = body && body.endDate;
    let endDate = parseDateValue(endDateInput);
    const endTimeInput = body && body.endTime;
    const endTime = parseTimeValue(endTimeInput);
    const calendar = normalizeCalendar(body && body.calendar);

    if (!details || !date || !calendar) {
      return sendJson(res, 400, { error: "Missing required fields" });
    }
    if (typeof timeInput === "string" && timeInput.trim() && !time) {
      return sendJson(res, 400, { error: "Invalid time" });
    }
    if (typeof endDateInput === "string" && endDateInput.trim() && !endDate) {
      return sendJson(res, 400, { error: "Invalid end date" });
    }
    if (typeof endTimeInput === "string" && endTimeInput.trim() && !endTime) {
      return sendJson(res, 400, { error: "Invalid end time" });
    }
    if (endTime && !endDate) {
      endDate = date;
    }
    if (endDate && endDate < date) {
      return sendJson(res, 400, { error: "End date must be on or after start date" });
    }

    const allowedCalendars = buildAllowedCalendars();
    if (!allowedCalendars.has(calendar)) {
      return sendJson(res, 400, { error: "Invalid calendar" });
    }

    const now = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      calendar,
      details,
      date,
      time,
      endDate: endDate || "",
      endTime: endTime || "",
      allDay: !time,
      createdBy: session.user,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await query(
        `INSERT INTO events (
          id, calendar, details, date, time, end_date, end_time, all_day,
          created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )`,
        [
          event.id,
          event.calendar,
          event.details,
          event.date,
          event.time || null,
          event.endDate || null,
          event.endTime || null,
          event.allDay,
          event.createdBy,
          event.createdAt,
          event.updatedAt,
        ]
      );
      return sendJson(res, 200, { event });
    } catch (error) {
      console.error("[events] save failed", error);
      return sendError(res, 500, "Unable to save event", error, debug);
    }
  }

  if (req.method === "PATCH") {
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing event id" });
    }

    const timeProvided = body && Object.prototype.hasOwnProperty.call(body, "time");
    const dateProvided = body && Object.prototype.hasOwnProperty.call(body, "date");
    const calendarProvided = body && Object.prototype.hasOwnProperty.call(body, "calendar");
    const endDateProvided = body && Object.prototype.hasOwnProperty.call(body, "endDate");
    const endTimeProvided = body && Object.prototype.hasOwnProperty.call(body, "endTime");
    const updates = {
      details: body && typeof body.details === "string" ? body.details.trim() : null,
      date: dateProvided ? parseDateValue(body.date) : null,
      time: timeProvided ? parseTimeValue(body.time) : null,
      calendar: calendarProvided ? normalizeCalendar(body.calendar) : null,
      endDate: endDateProvided ? parseDateValue(body.endDate) : null,
      endTime: endTimeProvided ? parseTimeValue(body.endTime) : null,
    };

    try {
      const existing = await getEventById(id);
      if (!existing) {
        return sendJson(res, 404, { error: "Event not found" });
      }
      const isMealsEvent = existing.calendar === "meals";
      if (session.role !== "admin" && !isMealsEvent) {
        return sendJson(res, 403, { error: "Admin required" });
      }
      if (session.role !== "admin" && (dateProvided || timeProvided || calendarProvided)) {
        return sendJson(res, 403, { error: "Not allowed" });
      }

      if (dateProvided && !updates.date) {
        return sendJson(res, 400, { error: "Invalid date" });
      }
      if (timeProvided && typeof body.time === "string" && body.time.trim() && !updates.time) {
        return sendJson(res, 400, { error: "Invalid time" });
      }
      if (endDateProvided && typeof body.endDate === "string" && body.endDate.trim() && !updates.endDate) {
        return sendJson(res, 400, { error: "Invalid end date" });
      }
      if (endTimeProvided && typeof body.endTime === "string" && body.endTime.trim() && !updates.endTime) {
        return sendJson(res, 400, { error: "Invalid end time" });
      }

      const allowedCalendars = buildAllowedCalendars();
      if (updates.calendar && !allowedCalendars.has(updates.calendar)) {
        return sendJson(res, 400, { error: "Invalid calendar" });
      }
      if (session.role !== "admin" && updates.calendar && updates.calendar !== "meals") {
        return sendJson(res, 403, { error: "Not allowed" });
      }
      const next = {
        ...existing,
        details: updates.details !== null ? updates.details : existing.details,
        date: updates.date !== null ? updates.date : existing.date,
        time: updates.time !== null ? updates.time : existing.time,
        calendar: updates.calendar !== null ? updates.calendar : existing.calendar,
        endDate: updates.endDate !== null ? updates.endDate : existing.endDate,
        endTime: updates.endTime !== null ? updates.endTime : existing.endTime,
        updatedAt: new Date().toISOString(),
      };
      if (next.endTime && !next.endDate) {
        next.endDate = next.date;
      }
      if (next.endDate && next.endDate < next.date) {
        return sendJson(res, 400, { error: "End date must be on or after start date" });
      }
      next.allDay = !next.time;

      const result = await query(
        `UPDATE events
         SET calendar = $1,
             details = $2,
             date = $3,
             time = $4,
             end_date = $5,
             end_time = $6,
             all_day = $7,
             updated_at = $8
         WHERE id = $9
         RETURNING id, calendar, details, date, time, end_date, end_time, all_day,
                   created_by, created_at, updated_at`,
        [
          next.calendar,
          next.details,
          next.date,
          next.time || null,
          next.endDate || null,
          next.endTime || null,
          next.allDay,
          next.updatedAt,
          next.id,
        ]
      );
      const updated = result.rows[0] ? rowToEvent(result.rows[0]) : next;
      return sendJson(res, 200, { event: updated });
    } catch (error) {
      console.error("[events] update failed", error);
      return sendError(res, 500, "Unable to update event", error, debug);
    }
  }

  if (req.method === "DELETE") {
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing event id" });
    }
    try {
      const existing = await getEventById(id);
      if (!existing) {
        return sendJson(res, 404, { error: "Event not found" });
      }
      if (session.role !== "admin" && existing.calendar !== "meals") {
        return sendJson(res, 403, { error: "Admin required" });
      }
      await query("DELETE FROM events WHERE id = $1", [id]);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      console.error("[events] delete failed", error);
      return sendError(res, 500, "Unable to delete event", error, debug);
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return sendJson(res, 405, { error: "Method not allowed" });
};
