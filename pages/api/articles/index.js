import fs from "fs";
import path from "path";
import { withIronSessionApiRoute } from "../../../lib/session";

// 数据文件路径
const dataDirectory = path.join(process.cwd(), "data"); // 假设你的数据在根目录 data 文件夹
const filePath = path.join(dataDirectory, "articles.json");

async function articlesHandler(req, res) {
  // 1. 处理 GET 请求：获取文章列表 (公开)
  if (req.method === "GET") {
    try {
      // 确保文件存在
      if (!fs.existsSync(filePath)) {
        return res.status(200).json([]);
      }
      const fileContents = fs.readFileSync(filePath, "utf8");
      const articles = JSON.parse(fileContents || "[]");
      
      // 按时间倒序排列
      articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return res.status(200).json(articles);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "读取数据失败" });
    }
  }

  // 2. 处理 POST 请求：创建新文章 (私有 - 需要登录)
  if (req.method === "POST") {
    const user = req.session.user;

    // 🔒 安全检查：如果没有登录，直接拒绝
    if (!user || !user.isLoggedIn) {
      return res.status(401).json({ message: "未授权：请先登录" });
    }

    try {
      const { title, summary, content, tags } = req.body;

      // 简单验证
      if (!title || !content) {
        return res.status(400).json({ message: "标题和内容不能为空" });
      }

      // 读取现有数据
      let articles = [];
      if (fs.existsSync(filePath)) {
        const fileContents = fs.readFileSync(filePath, "utf8");
        articles = JSON.parse(fileContents || "[]");
      }

      // 创建新文章对象
      const newArticle = {
        id: Date.now().toString(), // 简单用时间戳做ID
        title,
        summary,
        content,
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date().toISOString(),
      };

      // 写入文件
      articles.push(newArticle);
      
      // 确保目录存在
      if (!fs.existsSync(dataDirectory)) {
        fs.mkdirSync(dataDirectory, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(articles, null, 2));

      return res.status(201).json(newArticle);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "保存文章失败" });
    }
  }

  // 其他方法不被允许
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

// 使用 iron-session 包裹，这样 req.session 才能用
export default withIronSessionApiRoute(articlesHandler);