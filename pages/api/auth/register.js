import { withIronSessionApiRoute } from "../../../lib/session";
import { saveUser } from "../../../lib/db";
import bcrypt from "bcrypt";

async function registerHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const rawEmail = req.body?.email;
  const email = String(rawEmail || "").trim().toLowerCase();
  const otp = String(req.body?.otp || "").trim();
  const password = String(req.body?.password || "");

  const sessionOtp = req.session.otp;
  const now = Date.now();
  if (!sessionOtp || sessionOtp.email !== email || sessionOtp.expires < now) {
    return res.status(400).json({ message: "验证码错误或已过期" });
  }

  if (sessionOtp.attempts >= 5) {
    req.session.otp = null;
    await req.session.save();
    return res.status(429).json({ message: "尝试次数过多，请重新获取验证码" });
  }

  if (sessionOtp.code !== otp) {
    req.session.otp = { ...sessionOtp, attempts: (sessionOtp.attempts || 0) + 1 };
    await req.session.save();
    return res.status(400).json({ message: "验证码错误或已过期" });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: "密码至少 8 位" });
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
    return res.status(400).json({ message: error.message || "注册失败" });
  }
}

export default withIronSessionApiRoute(registerHandler);
