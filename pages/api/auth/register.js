import { withIronSessionApiRoute } from "../../../lib/session";
import { saveUser } from "../../../lib/db";
import bcrypt from "bcryptjs";
import { consumeRateLimit } from "../../../lib/rateLimit";
import {
  constantTimeEqual,
  getClientIp,
  hashKey,
  isValidEmail,
  normalizeEmail,
  requireSameOrigin,
} from "../../../lib/security";

async function registerHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!requireSameOrigin(req, res)) return;

  const rawEmail = req.body?.email;
  const email = normalizeEmail(rawEmail);
  const otp = String(req.body?.otp || "").trim();
  const password = String(req.body?.password || "");

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "请输入有效的邮箱地址" });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: "密码长度应为 8–128 位" });
  }

  const ipRate = await consumeRateLimit(`rate:register:ip:${hashKey(getClientIp(req))}`, {
    limit: 20,
    windowSeconds: 15 * 60,
  });
  if (!ipRate.allowed) {
    res.setHeader("Retry-After", String(ipRate.retryAfter));
    return res.status(429).json({ message: "尝试次数过多，请稍后再试" });
  }

  const sessionOtp = req.session.otp;
  const now = Date.now();
  if (!sessionOtp || sessionOtp.email !== email || sessionOtp.expires < now) {
    return res.status(400).json({ message: "验证码错误或已过期" });
  }

  // The attempt counter inside the cookie can be reset by replaying an older
  // cookie, so the real limit is kept server-side. `expires` is fixed when the
  // code is issued, which scopes the counter to this one code.
  const otpRate = await consumeRateLimit(
    `rate:register:otp:${hashKey(`${email}:${sessionOtp.expires}`)}`,
    { limit: 5, windowSeconds: 10 * 60 }
  );
  if (sessionOtp.attempts >= 5 || !otpRate.allowed) {
    req.session.otp = null;
    await req.session.save();
    return res.status(429).json({ message: "尝试次数过多，请重新获取验证码" });
  }

  if (!/^\d{6}$/.test(otp) || !constantTimeEqual(sessionOtp.code, otp)) {
    req.session.otp = { ...sessionOtp, attempts: (sessionOtp.attempts || 0) + 1 };
    await req.session.save();
    return res.status(400).json({ message: "验证码错误或已过期" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = {
      email,
      passwordHash,
      username: email.split("@")[0],
      purchasedIds: [],
      createdAt: new Date().toISOString(),
    };

    await saveUser(newUser);

    req.session.user = {
      username: newUser.username,
      email: newUser.email,
      isAdmin: false,
      isLoggedIn: true,
    };
    req.session.otp = null;
    await req.session.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error?.message === "该邮箱已注册") {
      return res.status(409).json({ message: "该邮箱已注册" });
    }
    console.error("注册失败:", error);
    return res.status(500).json({ message: "注册失败，请稍后重试" });
  }
}

export default withIronSessionApiRoute(registerHandler);
