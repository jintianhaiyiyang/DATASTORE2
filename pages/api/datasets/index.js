import fs from "fs";
import path from "path";
import { withIronSessionApiRoute } from "../../../lib/session";

const dataFilePath = path.join(process.cwd(), "data", "datasets.json");
const usersFilePath = path.join(process.cwd(), "data", "users.json");

// 通用读取数据函数
function readData(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) { return []; }
}

async function handler(req, res) {
  const sessionUser = req.session.user;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const isAdmin = sessionUser?.isLoggedIn && sessionUser.username === adminUsername;

  // --- GET: 获取数据集列表 ---
  if (req.method === "GET") {
    const datasets = readData(dataFilePath);
    
    // 获取当前普通用户的购买记录
    let purchasedIds = [];
    if (sessionUser && !isAdmin) {
      const users = readData(usersFilePath);
      const user = users.find(u => u.email === sessionUser.email);
      purchasedIds = user?.purchasedIds || [];
    }

    const processedDatasets = datasets.map(d => {
      // 权限判断：管理员、已购买、或是免费资源
      const hasAccess = isAdmin || purchasedIds.includes(Number(d.id)) || Number(d.price) === 0;
      
      const { baiduLink, ...rest } = d; 
      return {
        ...rest,
        isPaid: hasAccess,
        // 只有在有权限时才向前端暴露真实的下载地址
        downloadUrl: hasAccess ? baiduLink : null 
      };
    });

    return res.status(200).json(processedDatasets);
  }

  // --- POST: 发布新数据集 (仅限管理员) ---
  if (req.method === "POST") {
    if (!isAdmin) {
      return res.status(401).json({ message: "只有管理员可以发布资源" });
    }

    // 新增 richContent 字段，接收前端传来的图文 HTML
    const { name, description, richContent, price, currency, tags, baiduLink } = req.body || {};
    
    if (!name || !baiduLink) {
      return res.status(400).json({ message: "名称和下载链接是必填项" });
    }

    const datasets = readData(dataFilePath);
    const newDataset = {
      id: Date.now(), // 使用时间戳作为唯一ID
      name,
      description,   // 用于列表显示的简短摘要
      richContent,    // 用于详情页显示的图文并茂内容
      price: Number(price || 0),
      currency: currency || "CNY",
      baiduLink,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
    };

    datasets.push(newDataset);
    fs.writeFileSync(dataFilePath, JSON.stringify(datasets, null, 2), "utf8");
    return res.status(201).json(newDataset);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

export default withIronSessionApiRoute(handler);