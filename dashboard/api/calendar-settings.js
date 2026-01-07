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

const normalizeBoolean = (value, fallback) => (typeof value === "boolean" ? value : fallback);

const mergeFilters = (current, updates) => {
  const next = {
    includeCustom: normalizeBoolean(updates && updates.includeCustom, current.includeCustom),
    useUpcomingKeywords: normalizeBoolean(
      updates && updates.useUpcomingKeywords,
      current.useUpcomingKeywords
    ),
    hideDailySchoolDetails: normalizeBoolean(
      updates && updates.hideDailySchoolDetails,
      current.hideDailySchoolDetails
    ),
    includeSources: { ...current.includeSources },
    includeCalendars: { ...current.includeCalendars },
  };

  if (updates && typeof updates.includeSources === "object") {
    Object.keys(next.includeSources).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates.includeSources, key)) {
        next.includeSources[key] = normalizeBoolean(
          updates.includeSources[key],
          next.includeSources[key]
        );
      }
    });
  }

  if (updates && typeof updates.includeCalendars === "object") {
    Object.keys(next.includeCalendars).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates.includeCalendars, key)) {
        next.includeCalendars[key] = normalizeBoolean(
          updates.includeCalendars[key],
          next.includeCalendars[key]
        );
      }
    });
  }

  return next;
};

const loadSettings = async () => {
  const result = await query(
    "SELECT id, filters, updated_at FROM calendar_settings WHERE id = $1",
    ["default"]
  );
  if (!result.rows[0]) {
    return null;
  }
  const row = result.rows[0];
  return {
    version: 1,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    filters: row.filters,
  };
};

const saveSettings = async (settings) => {
  await query(
    `INSERT INTO calendar_settings (id, filters, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id)
     DO UPDATE SET filters = EXCLUDED.filters, updated_at = EXCLUDED.updated_at`,
    ["default", settings.filters, settings.updatedAt]
  );
};

const buildDefaultSettings = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  filters: DEFAULT_FILTERS,
});

module.exports = async (req, res) => {
  const debug = getDebugFlag(req);
  if (req.method === "GET") {
    try {
      const stored = await loadSettings();
      const settings = stored || buildDefaultSettings();
      return sendJson(res, 200, { settings });
    } catch (error) {
      console.error("[calendar-settings] load failed", error);
      return sendError(res, 500, "Unable to load settings", error, debug);
    }
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const session = getAuthSession(req);
  if (!session || session.role !== "admin") {
    return sendJson(res, 401, { error: "Admin required" });
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    console.error("[calendar-settings] invalid json", error);
    return sendError(res, 400, "Invalid JSON", error, debug);
  }

  try {
    const stored = await loadSettings();
    const current = stored || buildDefaultSettings();
    const nextFilters = mergeFilters(current.filters || DEFAULT_FILTERS, body && body.filters ? body.filters : {});
    const next = {
      ...current,
      filters: nextFilters,
      updatedAt: new Date().toISOString(),
    };
    await saveSettings(next);
    return sendJson(res, 200, { settings: next });
  } catch (error) {
    console.error("[calendar-settings] update failed", error);
    return sendError(res, 500, "Unable to update settings", error, debug);
  }
};
