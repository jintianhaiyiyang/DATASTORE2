import nodemailer from "nodemailer";
import { withIronSessionApiRoute } from "../../../lib/session";
import { kv } from "@vercel/kv";
import crypto from "crypto";

// 允许注册的域名白名单
const ALLOWED_DOMAINS = [
  "gmail.com", "qq.com", "outlook.com", "163.com", "hotmail.com", 
  "airlink.us.kg" // 您的自定义域名
];

async function sendOtpHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

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
  // 1. 发送频率校验（IP + Email + Session）
  // ==========================================
  const now = Date.now();
  const cooldownMs = 60 * 1000; // 60 秒
  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim()
    || req.socket?.remoteAddress
    || "unknown";

  const checkAndSetCooldown = async (key) => {
    const last = await kv.get(key);
    if (typeof last === "number" && now - last < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - last)) / 1000);
      return remaining;
    }
    await kv.set(key, now, { ex: Math.ceil(cooldownMs / 1000) });
    return 0;
  };

  const [emailRemaining, ipRemaining] = await Promise.all([
    checkAndSetCooldown(`otp:email:${email}`),
    checkAndSetCooldown(`otp:ip:${ip}`),
  ]);

  const sessionLastSent = req.session.lastSent || 0;
  const sessionRemaining = now - sessionLastSent < cooldownMs
    ? Math.ceil((cooldownMs - (now - sessionLastSent)) / 1000)
    : 0;

  const remaining = Math.max(emailRemaining, ipRemaining, sessionRemaining);
  if (remaining > 0) {
    return res.status(429).json({
      message: `请求太频繁，请在 ${remaining} 秒后再试`
    });
  }

  // 2. 生成 6 位随机验证码（使用加密随机）
  const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  
  // 3. 存储验证码和发送时间戳到 Session
  req.session.otp = {
    email,
    code: otp,
    expires: now + 5 * 60 * 1000,
    attempts: 0
  };
  req.session.lastSent = now; // 记录本次发送时间
  await req.session.save();

  // 4. 配置 SMTP 传输器
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "465"), 
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // 默认启用证书校验，除非明确配置关闭
    tls: {
      rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== "false"
    }
  });

  try {
    // 5. 发送邮件内容
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
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
      `
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("SMTP 发送报错:", error);
    // 如果发送失败，建议清除时间戳限制，允许用户重试
    req.session.lastSent = 0;
    await req.session.save();
    return res.status(500).json({ message: "邮件发送失败" });
  }
}

export default withIronSessionApiRoute(sendOtpHandler);
