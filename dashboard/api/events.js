const crypto = require("crypto");
const { normalizeUser, parseUserList, verifyToken } = require("../lib/auth");

const readJsonBody = async (req) => {
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

const buildAllowedCalendars = () => {
  const familyUsers = parseUserList(process.env.FAMILY_USERS);
  const calendars = new Set(["family"]);
  familyUsers.forEach((_pass, user) => calendars.add(user));
  return calendars;
};

const loadEvents = async () => {
  const { head } = await import("@vercel/blob");
  try {
    const blob = await head("events.json");
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return Array.isArray(data.events) ? data.events : [];
  } catch (error) {
    if (error && error.name === "BlobNotFoundError") {
      return [];
    }
    throw error;
  }
};

const saveEvents = async (events) => {
  const { put } = await import("@vercel/blob");
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    events,
  };
  await put("events.json", JSON.stringify(payload, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
};

module.exports = async (req, res) => {
  if (req.method === "GET") {
    try {
      const events = await loadEvents();
      return sendJson(res, 200, { events });
    } catch (error) {
      return sendJson(res, 500, { error: "Unable to load events" });
    }
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid JSON" });
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
    const calendar = normalizeCalendar(body && body.calendar);

    if (!details || !date || !calendar) {
      return sendJson(res, 400, { error: "Missing required fields" });
    }
    if (typeof timeInput === "string" && timeInput.trim() && !time) {
      return sendJson(res, 400, { error: "Invalid time" });
    }

    const allowedCalendars = buildAllowedCalendars();
    if (!allowedCalendars.has(calendar)) {
      return sendJson(res, 400, { error: "Invalid calendar" });
    }

    if (session.role !== "admin" && calendar !== session.user && calendar !== "family") {
      return sendJson(res, 403, { error: "Not allowed for this calendar" });
    }

    const now = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      calendar,
      details,
      date,
      time,
      allDay: !time,
      createdBy: session.user,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const events = await loadEvents();
      events.push(event);
      await saveEvents(events);
      return sendJson(res, 200, { event });
    } catch (error) {
      return sendJson(res, 500, { error: "Unable to save event" });
    }
  }

  if (req.method === "PATCH") {
    if (session.role !== "admin") {
      return sendJson(res, 403, { error: "Admin required" });
    }
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing event id" });
    }

    const timeProvided = body && Object.prototype.hasOwnProperty.call(body, "time");
    const dateProvided = body && Object.prototype.hasOwnProperty.call(body, "date");
    const calendarProvided = body && Object.prototype.hasOwnProperty.call(body, "calendar");
    const updates = {
      details: body && typeof body.details === "string" ? body.details.trim() : null,
      date: dateProvided ? parseDateValue(body.date) : null,
      time: timeProvided ? parseTimeValue(body.time) : null,
      calendar: calendarProvided ? normalizeCalendar(body.calendar) : null,
    };

    if (dateProvided && !updates.date) {
      return sendJson(res, 400, { error: "Invalid date" });
    }
    if (timeProvided && typeof body.time === "string" && body.time.trim() && !updates.time) {
      return sendJson(res, 400, { error: "Invalid time" });
    }

    const allowedCalendars = buildAllowedCalendars();
    if (updates.calendar && !allowedCalendars.has(updates.calendar)) {
      return sendJson(res, 400, { error: "Invalid calendar" });
    }

    try {
      const events = await loadEvents();
      const index = events.findIndex((event) => event.id === id);
      if (index < 0) {
        return sendJson(res, 404, { error: "Event not found" });
      }
      const existing = events[index];
      const next = {
        ...existing,
        details: updates.details !== null ? updates.details : existing.details,
        date: updates.date !== null ? updates.date : existing.date,
        time: updates.time !== null ? updates.time : existing.time,
        calendar: updates.calendar !== null ? updates.calendar : existing.calendar,
        updatedAt: new Date().toISOString(),
      };
      next.allDay = !next.time;
      events[index] = next;
      await saveEvents(events);
      return sendJson(res, 200, { event: next });
    } catch (error) {
      return sendJson(res, 500, { error: "Unable to update event" });
    }
  }

  if (req.method === "DELETE") {
    if (session.role !== "admin") {
      return sendJson(res, 403, { error: "Admin required" });
    }
    const id = body && typeof body.id === "string" ? body.id : "";
    if (!id) {
      return sendJson(res, 400, { error: "Missing event id" });
    }
    try {
      const events = await loadEvents();
      const nextEvents = events.filter((event) => event.id !== id);
      if (nextEvents.length === events.length) {
        return sendJson(res, 404, { error: "Event not found" });
      }
      await saveEvents(nextEvents);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: "Unable to delete event" });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return sendJson(res, 405, { error: "Method not allowed" });
};
