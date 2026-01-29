import { withIronSessionApiRoute } from "../../../lib/session";
import { saveUser } from "../../../lib/db"; // ⬅️ 必须改用这个
import bcrypt from "bcrypt";

async function registerHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, otp, password } = req.body;

  // 1. 验证码校验逻辑 (保持不变)
  const sessionOtp = req.session.otp;
  if (!sessionOtp || sessionOtp.email !== email || sessionOtp.code !== otp) {
    return res.status(400).json({ message: "验证码错误或已过期" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    // 2. 核心改动：调用云数据库
    const newUser = {
      email,
      passwordHash,
      username: email.split("@")[0],
      purchasedIds: [],
      createdAt: new Date().toISOString(),
    };

    // 这一步会把数据存入你刚连上的 Vercel KV，而不是 users.json
    await saveUser(newUser); 

    // 3. 登录 Session 处理
    req.session.user = {
      username: newUser.username,
      email: newUser.email,
      isLoggedIn: true,
    };
    await req.session.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    // 如果 saveUser 抛出“邮箱已存在”，这里会捕获并返回给前端
    return res.status(400).json({ message: error.message });
  }
}

export default withIronSessionApiRoute(registerHandler);
