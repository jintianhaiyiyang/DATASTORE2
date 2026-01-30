// lib/withAuth.js
import { withIronSessionApiRoute } from "./session";

// 这是一个 API 中间件，用于保护路由
export function withAuth(handler) {
  return withIronSessionApiRoute(async (req, res) => {
    // 检查会话中是否存在已登录的用户
    if (!req.session.user?.isLoggedIn) {
      // 如果未登录，直接返回 401 未授权错误
      return res.status(401).json({ message: "未授权的访问" });
    }

    // 如果已登录，则继续执行原始的 API handler
    return handler(req, res);
  });
}