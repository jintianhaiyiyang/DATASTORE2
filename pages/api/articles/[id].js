import { withIronSessionApiRoute } from "../../../lib/session";
import { getArticles, updateArticle, deleteArticle } from "../../../lib/db";
import { cleanTags, cleanText, sanitizeRichText } from "../../../lib/content";
import { requireSameOrigin } from "../../../lib/security";

async function articleDetailRoute(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    try {
      const articles = await getArticles();
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

  if (req.method === "PUT") {
    if (!requireSameOrigin(req, res)) return;
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    try {
      const { title, summary, content, tags } = req.body || {};
      const patch = {};

      if (title !== undefined) {
        const safeTitle = cleanText(title, 120);
        if (!safeTitle) {
          return res.status(400).json({ message: "标题不能为空" });
        }
        patch.title = safeTitle;
      }
      if (summary !== undefined) patch.summary = cleanText(summary, 500);
      if (content !== undefined) {
        if (String(content).length > 100000) {
          return res.status(413).json({ message: "文章内容过长" });
        }
        const safeContent = sanitizeRichText(content);
        if (!safeContent) {
          return res.status(400).json({ message: "内容不能为空" });
        }
        patch.content = safeContent;
      }
      if (tags !== undefined) patch.tags = cleanTags(tags);
      patch.updatedAt = new Date().toISOString();

      const updated = await updateArticle(id, patch);
      if (!updated) {
        return res.status(404).json({ message: "文章不存在或已删除" });
      }
      return res.status(200).json(updated);
    } catch (e) {
      console.error("更新文章失败:", e);
      return res.status(500).json({ message: "更新失败，请稍后重试" });
    }
  }

  if (req.method === "DELETE") {
    if (!requireSameOrigin(req, res)) return;
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    try {
      const deleted = await deleteArticle(id);
      if (!deleted) return res.status(404).json({ message: "文章不存在或已删除" });
      return res.status(200).json({ success: true, message: "文章已删除" });
    } catch (e) {
      console.error("删除文章失败:", e);
      return res.status(500).json({ message: "删除失败，请稍后重试" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(articleDetailRoute);
