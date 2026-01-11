import fs from "fs";
import path from "path";
import { withIronSessionApiRoute } from "../../../lib/session";

// 数据文件路径
const filePath = path.join(process.cwd(), "data", "articles.json");

async function articleDetailHandler(req, res) {
  const { id } = req.query;

  // 1. 读取数据
  let articles = [];
  try {
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, "utf8");
      articles = JSON.parse(fileContents || "[]");
    }
  } catch (e) {
    return res.status(500).json({ message: "数据读取失败" });
  }

  const articleIndex = articles.findIndex((a) => a.id.toString() === id.toString());
  const article = articles[articleIndex];

  // 如果找不到文章，统一返回 404
  if (!article) {
    return res.status(404).json({ message: "文章不存在" });
  }

  // --- GET: 获取详情 (公开) ---
  if (req.method === "GET") {
    return res.status(200).json(article);
  }

  // --- 🔒 以下操作都需要登录权限 ---
  const user = req.session.user;
  if (!user || !user.isLoggedIn) {
    return res.status(401).json({ message: "未授权：请先登录" });
  }

  // --- PUT: 修改文章 (私有) ---
  if (req.method === "PUT") {
    const { title, summary, content, tags } = req.body;

    // 更新字段
    const updatedArticle = {
      ...article,
      title: title || article.title,
      summary: summary || article.summary,
      content: content || article.content,
      tags: tags || article.tags,
      updatedAt: new Date().toISOString(), // 更新修改时间
    };

    articles[articleIndex] = updatedArticle;
    
    // 保存文件
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2));
    
    return res.status(200).json(updatedArticle);
  }

  // --- DELETE: 删除文章 (私有) ---
  if (req.method === "DELETE") {
    const newArticles = articles.filter((a) => a.id.toString() !== id.toString());
    fs.writeFileSync(filePath, JSON.stringify(newArticles, null, 2));
    return res.status(200).json({ success: true });
  }

  // 其他方法
  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

// 必须用 iron-session 包裹
export default withIronSessionApiRoute(articleDetailHandler);