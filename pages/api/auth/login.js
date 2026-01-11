import { withIronSessionApiRoute } from "../../../lib/session";
import { getUsers } from "../../../lib/db"; 

async function loginRoute(req, res) {
  const { username, password } = req.body;
  const users = await getUsers(); // ⬅️ 从 Vercel KV 获取

  const user = users.find(u => 
    (u.email === username || u.username === username) && u.password === password
  );

  if (!user) {
    return res.status(403).json({ message: "账号或密码错误" });
  }

  req.session.user = { username: user.username, email: user.email, isLoggedIn: true };
  await req.session.save();
  return res.status(200).json({ success: true });
}

export default withIronSessionApiRoute(loginRoute);
