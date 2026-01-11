import { withIronSessionApiRoute } from "../../../lib/session";

function logoutRoute(req, res) {
  // 销毁当前会话
  req.session.destroy();
  return res.status(200).json({ success: true, message: "已安全退出" });
}

export default withIronSessionApiRoute(logoutRoute);