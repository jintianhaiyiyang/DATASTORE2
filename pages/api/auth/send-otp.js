import nodemailer from "nodemailer";
import { withIronSessionApiRoute } from "../../../lib/session";
import { kv } from "@vercel/kv";
import crypto from "crypto";

// Domains allowed for registration
const ALLOWED_DOMAINS = [
  "gmail.com",
  "qq.com",
  "outlook.com",
  "163.com",
  "hotmail.com",
  "airlink.us.kg",
];

async function sendOtpHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ message: "邮件服务未配置" });
  }

  const rawEmail = req.body?.email;
  const email = String(rawEmail || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: "请输入有效的邮箱地址" });
  }

  const domain = email.split("@")[1].toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ message: "仅支持主流邮箱及官方域名注册" });
  }

  // ==========================================
  // 1. Rate limit check (IP + Email + Session) — do not write cooldowns yet
  // ==========================================
  const now = Date.now();
  const cooldownMs = 60 * 1000;
  const cooldownSec = Math.ceil(cooldownMs / 1000);
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const getRemaining = async (key) => {
    try {
      const last = await kv.get(key);
      if (typeof last === "number" && now - last < cooldownMs) {
        return Math.ceil((cooldownMs - (now - last)) / 1000);
      }
    } catch (e) {
      console.error("OTP cooldown read failed:", e);
    }
    return 0;
  };

  const emailKey = `otp:email:${email}`;
  const ipKey = `otp:ip:${ip}`;

  const [emailRemaining, ipRemaining] = await Promise.all([
    getRemaining(emailKey),
    getRemaining(ipKey),
  ]);

  const sessionLastSent = req.session.lastSent || 0;
  const sessionRemaining =
    now - sessionLastSent < cooldownMs
      ? Math.ceil((cooldownMs - (now - sessionLastSent)) / 1000)
      : 0;

  const remaining = Math.max(emailRemaining, ipRemaining, sessionRemaining);
  if (remaining > 0) {
    return res.status(429).json({
      message: `请求太频繁，请在 ${remaining} 秒后再试`,
    });
  }

  // 2. Generate 6-digit OTP
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");

  // 3. Store OTP in session before sending
  req.session.otp = {
    email,
    code: otp,
    expires: now + 5 * 60 * 1000,
    attempts: 0,
  };
  req.session.lastSent = now;
  await req.session.save();

  // 4. SMTP transporter
  const port = parseInt(process.env.EMAIL_PORT || "465", 10);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== "false",
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "【数据小商店】您的注册验证码",
      html: `
        <div style="font-family: sans-serif; padding: 24px; border: 1px solid #E5E7EB; border-radius: 16px; background-color: #fff;">
          <h2 style="color: #111827; margin-bottom: 16px;">验证码服务</h2>
          <p style="font-size: 16px; color: #4B5563; margin-bottom: 24px;">您的验证码为：</p>
          <div style="font-size: 32px; font-weight: 800; color: #2563EB; letter-spacing: 4px; margin-bottom: 24px;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #9CA3AF;">该验证码 5 分钟内有效。为了您的账号安全，请勿将验证码告知他人。</p>
        </div>
      `,
    });

    // Only set distributed cooldowns after a successful send
    try {
      await Promise.all([
        kv.set(emailKey, now, { ex: cooldownSec }),
        kv.set(ipKey, now, { ex: cooldownSec }),
      ]);
    } catch (e) {
      console.error("OTP cooldown write failed:", e);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("SMTP 发送报错:", error);
    // Allow immediate retry after send failure
    req.session.lastSent = 0;
    await req.session.save();
    return res.status(500).json({ message: "邮件发送失败" });
  }
}

export default withIronSessionApiRoute(sendOtpHandler);
