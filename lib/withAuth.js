// lib/withAuth.js
import { withIronSessionApiRoute } from "./session";

/**
 * Protect an API route so only logged-in users can access it.
 * Pass { admin: true } to require administrator privileges.
 */
export function withAuth(handler, options = {}) {
  const requireAdmin = !!options.admin;

  return withIronSessionApiRoute(async (req, res) => {
    if (!req.session.user?.isLoggedIn) {
      return res.status(401).json({ message: "未授权的访问" });
    }

    if (requireAdmin && !req.session.user.isAdmin) {
      return res.status(403).json({ message: "需要管理员权限" });
    }

    return handler(req, res);
  });
}
