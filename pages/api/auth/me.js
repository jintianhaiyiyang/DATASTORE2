import { withIronSessionApiRoute } from "../../../lib/session";

async function handler(req, res) {
  const user = req.session.user;

  if (!user || !user.isLoggedIn) {
    return res.status(200).json({ isAuthenticated: false });
  }

  return res.status(200).json({ 
    isAuthenticated: true, 
    username: user.username 
  });
}

export default withIronSessionApiRoute(handler);