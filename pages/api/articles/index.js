import { withIronSessionApiRoute } from "../../../lib/session";
import { getArticles, saveArticle } from "../../../lib/db";
import { cleanTags, cleanText, sanitizeRichText } from "../../../lib/content";
import { randomId, requireSameOrigin } from "../../../lib/security";

async function articlesHandler(req, res) {
  if (req.method === "GET") {
    try {
      const articles = await getArticles();
      return res.status(200).json(articles);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "读取数据失败" });
    }
  }

  if (req.method === "POST") {
    if (!requireSameOrigin(req, res)) return;
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    try {
      const { title, summary, content, tags } = req.body || {};

      const safeTitle = cleanText(title, 120);
      const safeContent = sanitizeRichText(content);
      if (!safeTitle || !safeContent) {
        return res.status(400).json({ message: "标题和内容不能为空" });
      }
      if (String(content).length > 100000) {
        return res.status(413).json({ message: "文章内容过长" });
      }

      const newArticle = {
        id: randomId("article_"),
        title: safeTitle,
        summary: cleanText(summary, 500),
        content: safeContent,
        tags: cleanTags(tags),
        createdAt: new Date().toISOString(),
        author: user.username || "Admin",
      };

      await saveArticle(newArticle);
      return res.status(201).json(newArticle);
    } catch (error) {
      console.error("发布文章失败:", error);
      return res.status(500).json({ message: "保存文章失败" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(articlesHandler);
