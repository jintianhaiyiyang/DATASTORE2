import { withIronSessionApiRoute } from "../../../lib/session";

async function meRoute(req, res) {
  // 直接从 Session 中读取用户信息
  if (req.session.user) {
    res.json({
      ...req.session.user,
      isLoggedIn: true,
    });
  } else {
    res.json({
      isLoggedIn: false,
    });
  }
}

export default withIronSessionApiRoute(meRoute);
