// lib/session.js
import { getIronSession } from "iron-session";

function resolveSessionPassword() {
  const password = process.env.COOKIE_PASSWORD;
  if (password && password.length >= 32) {
    return password;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "COOKIE_PASSWORD 必须配置为至少 32 位的随机字符串（见 README 环境变量说明）"
    );
  }
  // Local/dev fallback so the app can start without full env setup
  return "dev_only_cookie_password_at_least_32_chars!!";
}

export function getSessionOptions() {
  return {
    password: resolveSessionPassword(),
    cookieName: "data_store_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  };
}

// Wrapper that attaches iron-session to req.session for API routes
export function withIronSessionApiRoute(handler) {
  return async function (req, res) {
    const session = await getIronSession(req, res, getSessionOptions());
    req.session = session;
    return handler(req, res);
  };
}
