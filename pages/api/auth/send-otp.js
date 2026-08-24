import nodemailer from "nodemailer";
import { withIronSessionApiRoute } from "../../../lib/session";
import crypto from "crypto";
import { consumeRateLimit } from "../../../lib/rateLimit";
import {
  getClientIp,
  hashKey,
  isValidEmail,
  normalizeEmail,
  requireSameOrigin,
} from "../../../lib/security";

// Domains allowed for registration
const DEFAULT_ALLOWED_DOMAINS =
  "gmail.com,qq.com,outlook.com,163.com,hotmail.com";

function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || DEFAULT_ALLOWED_DOMAINS)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

async function sendOtpHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!requireSameOrigin(req, res)) return;

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ message: "邮件服务未配置" });
  }

  const rawEmail = req.body?.email;
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "请输入有效的邮箱地址" });
  }

  const domain = email.split("@")[1].toLowerCase();
  if (!allowedDomains().includes(domain)) {
    return res.status(400).json({ message: "仅支持主流邮箱及官方域名注册" });
  }

  // ==========================================
  // 1. Rate limit check (IP + Email + Session) — do not write cooldowns yet
  // ==========================================
  const now = Date.now();
  const cooldownSec = 60;
  const ip = getClientIp(req);
  const [emailRate, ipRate] = await Promise.all([
    consumeRateLimit(`rate:otp:email:${hashKey(email)}`, {
      limit: 1,
      windowSeconds: cooldownSec,
    }),
    consumeRateLimit(`rate:otp:ip:${hashKey(ip)}`, {
      limit: 5,
      windowSeconds: cooldownSec,
    }),
  ]);
  if (!emailRate.allowed || !ipRate.allowed) {
    const remaining = Math.max(emailRate.retryAfter, ipRate.retryAfter);
    res.setHeader("Retry-After", String(remaining));
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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("SMTP 发送报错:", error);
    req.session.otp = null;
    await req.session.save();
    return res.status(500).json({ message: "邮件发送失败" });
  }
}

export default withIronSessionApiRoute(sendOtpHandler);
