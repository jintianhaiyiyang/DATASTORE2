import { withIronSessionApiRoute } from "../../../lib/session";
import { getUsers, updateUserByEmail } from "../../../lib/db"; 
import bcrypt from "bcrypt";

async function loginRoute(req, res) {
  const { username, password } = req.body;

  // ==========================================
  // 🛡️ 1. 超级管理员通道 (Special Account)
  // ==========================================
  // 您可以在 Vercel 环境变量里设置，或者直接用下面的默认值
  const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123"; // 您的特殊密码

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // 颁发管理员 Session
    req.session.user = {
      username: ADMIN_USER,
      isAdmin: true, // 🟢 关键：标记为管理员
      isLoggedIn: true,
    };
    await req.session.save();
    return res.status(200).json({ success: true, username: ADMIN_USER });
  }

  // ==========================================
  // 👤 2. 普通用户通道 (查云数据库)
  // ==========================================
  try {
    const users = await getUsers(); // 从 Vercel KV 获取
    
    // 支持邮箱或用户名登录
    const user = users.find(u => u.email === username || u.username === username);

    if (!user) {
      return res.status(403).json({ message: "账号或密码错误" });
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(403).json({ message: "账号或密码错误" });
      }
    } else if (user.password) {
      if (user.password !== password) {
        return res.status(403).json({ message: "账号或密码错误" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await updateUserByEmail(user.email, { passwordHash });
    } else {
      return res.status(403).json({ message: "账号需要重置密码，请先找回或重置。" });
    }

    // 颁发普通用户 Session
    req.session.user = { 
      username: user.username, 
      email: user.email, 
      isAdmin: false, // 🔴 普通用户没有权限
      isLoggedIn: true 
    };
    
    await req.session.save();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("登录出错:", error);
    return res.status(500).json({ message: "服务器内部错误" });
  }
}

export default withIronSessionApiRoute(loginRoute);
