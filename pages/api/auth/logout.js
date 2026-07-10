import { withIronSessionApiRoute } from "../../../lib/session";

async function logoutRoute(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  await req.session.destroy();
  return res.status(200).json({ success: true, message: "已安全退出" });
}

export default withIronSessionApiRoute(logoutRoute);
