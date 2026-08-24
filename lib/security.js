import crypto from "crypto";
import net from "net";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function constantTimeEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

export function randomId(prefix = "") {
  return `${prefix}${Date.now()}_${crypto.randomBytes(12).toString("hex")}`;
}

export function hashKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function getClientIp(req) {
  const forwarded = Array.isArray(req.headers["x-forwarded-for"])
    ? req.headers["x-forwarded-for"][0]
    : String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const candidate = (forwarded || req.socket?.remoteAddress || "unknown").replace(
    /^::ffff:/,
    ""
  );
  return net.isIP(candidate) ? candidate : "unknown";
}

function requestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  return host ? `${protocol}://${host}` : "";
}

export function isSameOriginRequest(req) {
  if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
    return false;
  }

  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;

  const allowed = [requestOrigin(req), process.env.NEXT_PUBLIC_SITE_URL]
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    });

  try {
    return allowed.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function requireSameOrigin(req, res) {
  if (isSameOriginRequest(req)) return true;
  res.status(403).json({ message: "请求来源无效" });
  return false;
}

export function resolveSameOriginRedirect(value, siteUrl) {
  const base = new URL(siteUrl);
  const target = new URL(value || "/", base);
  if (target.origin !== base.origin || !["http:", "https:"].includes(target.protocol)) {
    return base.toString();
  }
  return target.toString();
}
