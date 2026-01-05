const { normalizeUser, parseUserList, createToken } = require("../lib/auth");

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
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let body = null;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: "Invalid JSON" });
  }

  const username = normalizeUser(body && body.username);
  const password = body && typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return sendJson(res, 400, { error: "Username and password required" });
  }

  const familyUsers = parseUserList(process.env.FAMILY_USERS);
  const adminUser = normalizeUser(process.env.ADMIN_USER);
  const adminPass = process.env.ADMIN_PASS || "";

  let role = null;
  if (adminUser && username === adminUser && password === adminPass) {
    role = "admin";
  } else if (familyUsers.has(username) && familyUsers.get(username) === password) {
    role = "user";
  }

  if (!role) {
    return sendJson(res, 401, { error: "Invalid credentials" });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return sendJson(res, 500, { error: "Server missing AUTH_SECRET" });
  }

  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const token = createToken({ user: username, role, exp: expires }, secret);

  return sendJson(res, 200, {
    token,
    user: username,
    role,
    expires,
  });
};
