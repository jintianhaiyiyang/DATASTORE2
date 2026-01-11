import { withIronSessionApiRoute } from "../../../lib/session";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

async function loginRoute(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  const { username, password } = req.body || {};
  
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "用户名或密码错误" });
  }

  // 登录成功，设置 session
  req.session.user = {
    username: ADMIN_USERNAME,
    isLoggedIn: true,
  };
  
  await req.session.save();
  return res.status(200).json({ success: true, username });
}

export default withIronSessionApiRoute(loginRoute);