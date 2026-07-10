import { withIronSessionApiRoute } from "../../../lib/session";
import { getArticles, saveArticle } from "../../../lib/db";

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
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    try {
      const { title, summary, content, tags } = req.body || {};

      if (!title || !content) {
        return res.status(400).json({ message: "标题和内容不能为空" });
      }

      const newArticle = {
        id: Date.now().toString(),
        title: String(title).trim(),
        summary: summary ? String(summary).trim() : "",
        content: String(content),
        tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
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
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withIronSessionApiRoute(articlesHandler);
