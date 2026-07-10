import jwt from "jsonwebtoken";

/**
 * Legacy JWT helpers (session-based iron-session is the primary auth).
 * Kept for optional/custom admin token use; prefer iron-session in new code.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_PASSWORD;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET 或 COOKIE_PASSWORD 未配置");
  }
  return "dev-secret-change-me-not-for-production";
}

export function createAdminToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function getAdminFromRequest(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (e) {
    return null;
  }
}
