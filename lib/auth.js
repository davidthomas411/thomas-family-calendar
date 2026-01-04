const crypto = require("crypto");

const normalizeUser = (value) => (value || "").trim().toLowerCase();

const parseUserList = (value) => {
  const map = new Map();
  if (!value) {
    return map;
  }
  value.split(",").forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    const [rawUser, ...rest] = trimmed.split(":");
    const username = normalizeUser(rawUser);
    const password = rest.join(":").trim();
    if (!username || !password) {
      return;
    }
    map.set(username, password);
  });
  return map;
};

const base64UrlEncode = (value) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value) => Buffer.from(value, "base64url").toString("utf8");

const createToken = (payload, secret) => {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
};

const verifyToken = (token, secret) => {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (signature.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch (error) {
    return null;
  }
  if (payload.exp && Date.now() > payload.exp) {
    return null;
  }
  return payload;
};

module.exports = {
  normalizeUser,
  parseUserList,
  createToken,
  verifyToken,
};
