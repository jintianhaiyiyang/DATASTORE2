import { withIronSessionApiRoute } from "../../../lib/session";
import { getArticles, saveArticle } from "../../../lib/db"; // ⬅️ 引入云数据库方法

async function articlesHandler(req, res) {
  // 1. 获取文章列表 (公开)
  if (req.method === "GET") {
    try {
      const articles = await getArticles(); // 从 KV 读取
      return res.status(200).json(articles);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "读取数据失败" });
    }
  }

  // 2. 创建新文章 (需要登录)
  if (req.method === "POST") {
    const user = req.session.user;
    if (!user || !user.isLoggedIn) {
      return res.status(401).json({ message: "未授权：请先登录" });
    }

    try {
      const { title, summary, content, tags } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "标题和内容不能为空" });
      }

      // 构建新文章对象
      const newArticle = {
        id: Date.now().toString(),
        title,
        summary,
        content,
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date().toISOString(),
        author: user.username || "Admin" // 记录作者
      };

      // 💾 保存到云数据库
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
