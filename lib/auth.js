import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function createAdminToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function getAdminFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}
