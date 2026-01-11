import nodemailer from "nodemailer";
import { withIronSessionApiRoute } from "../../../lib/session";

// 允许注册的域名白名单
const ALLOWED_DOMAINS = [
  "gmail.com", "qq.com", "outlook.com", "163.com", "hotmail.com", 
  "airlink.us.kg" // 您的自定义域名
];

async function sendOtpHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ message: "请输入有效的邮箱地址" });
  }

  const domain = email.split("@")[1].toLowerCase();
  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({ message: "仅支持主流邮箱及官方域名注册" });
  }

  // ==========================================
  // 1. 核心改进：增加发送间隔校验
  // ==========================================
  const now = Date.now();
  const lastSent = req.session.lastSent || 0;
  const cooldown = 60 * 1000; // 设置为 60 秒间隔

  if (now - lastSent < cooldown) {
    const remaining = Math.ceil((cooldown - (now - lastSent)) / 1000);
    return res.status(429).json({ 
      message: `请求太频繁，请在 ${remaining} 秒后再试` 
    });
  }

  // 2. 生成 6 位随机验证码
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 3. 存储验证码和发送时间戳到 Session
  req.session.otp = { 
    email, 
    code: otp, 
    expires: now + 5 * 60 * 1000 
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
    // 解决之前遇到的 self-signed certificate 报错
    tls: {
      rejectUnauthorized: false 
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
    return res.status(500).json({ message: "邮件发送失败", error: error.message });
  }
}

export default withIronSessionApiRoute(sendOtpHandler);