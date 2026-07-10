import { withIronSessionApiRoute } from "../../../lib/session";

async function meRoute(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  if (req.session.user) {
    return res.json({
      ...req.session.user,
      isLoggedIn: true,
      isAdmin: !!req.session.user.isAdmin,
    });
  }

  return res.json({
    isLoggedIn: false,
    isAdmin: false,
  });
}

export default withIronSessionApiRoute(meRoute);
