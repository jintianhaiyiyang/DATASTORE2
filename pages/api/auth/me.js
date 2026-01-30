import { withIronSessionApiRoute } from "../../../lib/session";

async function meRoute(req, res) {
  if (req.session.user) {
    res.json({
      ...req.session.user, // 这会包含 isAdmin: true/false
      isLoggedIn: true,
    });
  } else {
    res.json({
      isLoggedIn: false,
      isAdmin: false,
    });
  }
}

export default withIronSessionApiRoute(meRoute);
