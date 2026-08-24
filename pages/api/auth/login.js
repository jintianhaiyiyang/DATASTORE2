import { withIronSessionApiRoute } from "../../../lib/session";
import { getUserByLogin, updateUserByEmail } from "../../../lib/db";
import bcrypt from "bcryptjs";
import { clearRateLimit, consumeRateLimit } from "../../../lib/rateLimit";
import {
  constantTimeEqual,
  getClientIp,
  hashKey,
  requireSameOrigin,
} from "../../../lib/security";

async function loginRoute(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!requireSameOrigin(req, res)) return;

  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password || username.length > 254 || password.length > 128) {
    return res.status(400).json({ message: "请输入账号和密码" });
  }

  const clientIp = getClientIp(req);
  const rateKey = `rate:login:${hashKey(`${clientIp}:${username.toLowerCase()}`)}`;
  const ipRateKey = `rate:login-ip:${hashKey(clientIp)}`;
  const [rate, ipRate] = await Promise.all([
    consumeRateLimit(rateKey, { limit: 8, windowSeconds: 15 * 60 }),
    consumeRateLimit(ipRateKey, { limit: 30, windowSeconds: 15 * 60 }),
  ]);
  res.setHeader("X-RateLimit-Remaining", String(Math.min(rate.remaining, ipRate.remaining)));
  if (!rate.allowed || !ipRate.allowed) {
    res.setHeader("Retry-After", String(Math.max(rate.retryAfter, ipRate.retryAfter)));
    return res.status(429).json({ message: "登录尝试过多，请稍后再试" });
  }

  // ==========================================
  // 1. Super admin channel
  // ==========================================
  const ADMIN_USER = process.env.ADMIN_USERNAME;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD;

  if (
    ADMIN_USER &&
    ADMIN_PASS &&
    constantTimeEqual(username, ADMIN_USER) &&
    constantTimeEqual(password, ADMIN_PASS)
  ) {
    req.session.user = {
      username: ADMIN_USER,
      isAdmin: true,
      isLoggedIn: true,
    };
    await req.session.save();
    await clearRateLimit(rateKey);
    return res.status(200).json({ success: true, username: ADMIN_USER, isAdmin: true });
  }

  // ==========================================
  // 2. Regular user channel (KV)
  // ==========================================
  try {
    const user = await getUserByLogin(username);

    if (!user) {
      return res.status(401).json({ message: "账号或密码错误" });
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "账号或密码错误" });
      }
    } else if (user.password) {
      // Legacy plaintext migration path
      if (!constantTimeEqual(user.password, password)) {
        return res.status(401).json({ message: "账号或密码错误" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await updateUserByEmail(user.email, { passwordHash });
    } else {
      return res.status(401).json({ message: "账号或密码错误" });
    }

    req.session.user = {
      username: user.username,
      email: user.email,
      isAdmin: false,
      isLoggedIn: true,
    };

    await req.session.save();
    await clearRateLimit(rateKey);
    return res.status(200).json({ success: true, isAdmin: false });
  } catch (error) {
    console.error("登录出错:", error);
    return res.status(500).json({ message: "服务器内部错误" });
  }
}

export default withIronSessionApiRoute(loginRoute);
