import { withIronSessionApiRoute } from "../../../lib/session";
// 引入云数据库操作方法 (获取列表、删除文章)
import { getArticles, deleteArticle } from "../../../lib/db";

async function articleDetailRoute(req, res) {
  const { id } = req.query;

  // --- GET: 获取文章详情 (公开) ---
  if (req.method === "GET") {
    try {
      // 1. 从云数据库获取所有文章
      const articles = await getArticles();
      
      // 2. 查找匹配 ID 的文章
      // 注意：存进去的 ID 可能是数字也可能是字符串，统一转字符串比较最稳妥
      const article = articles.find((a) => String(a.id) === String(id));

      if (!article) {
        return res.status(404).json({ message: "文章不存在或已删除" });
      }

      return res.json(article);
    } catch (error) {
      console.error("获取文章详情失败:", error);
      return res.status(500).json({ message: "服务器内部错误" });
    }
  }

  // --- DELETE: 删除文章 (仅管理员) ---
  if (req.method === "DELETE") {
    const user = req.session.user;
    
    // 权限检查：必须登录且是管理员
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    try {
      // 调用 db.js 中的删除方法
      await deleteArticle(id);
      return res.status(200).json({ success: true, message: "文章已删除" });
    } catch (e) {
      console.error("删除文章失败:", e);
      return res.status(500).json({ message: "删除失败: " + e.message });
    }
  }

  // 其他方法不支持
  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withIronSessionApiRoute(articleDetailRoute);
