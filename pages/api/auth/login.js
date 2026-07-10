import { withIronSessionApiRoute } from "../../../lib/session";
import { getUsers, updateUserByEmail } from "../../../lib/db";
import bcrypt from "bcrypt";

async function loginRoute(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res.status(400).json({ message: "请输入账号和密码" });
  }

  // ==========================================
  // 1. Super admin channel
  // ==========================================
  const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = {
      username: ADMIN_USER,
      isAdmin: true,
      isLoggedIn: true,
    };
    await req.session.save();
    return res.status(200).json({ success: true, username: ADMIN_USER, isAdmin: true });
  }

  // ==========================================
  // 2. Regular user channel (KV)
  // ==========================================
  try {
    const users = await getUsers();
    const user = users.find(
      (u) => u.email === username.toLowerCase() || u.username === username
    );

    if (!user) {
      return res.status(403).json({ message: "账号或密码错误" });
    }

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(403).json({ message: "账号或密码错误" });
      }
    } else if (user.password) {
      // Legacy plaintext migration path
      if (user.password !== password) {
        return res.status(403).json({ message: "账号或密码错误" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      await updateUserByEmail(user.email, { passwordHash });
    } else {
      return res.status(403).json({ message: "账号需要重置密码，请先找回或重置。" });
    }

    req.session.user = {
      username: user.username,
      email: user.email,
      isAdmin: false,
      isLoggedIn: true,
    };

    await req.session.save();
    return res.status(200).json({ success: true, isAdmin: false });
  } catch (error) {
    console.error("登录出错:", error);
    return res.status(500).json({ message: "服务器内部错误" });
  }
}

export default withIronSessionApiRoute(loginRoute);
