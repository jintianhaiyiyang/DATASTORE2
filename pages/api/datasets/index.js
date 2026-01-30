import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, saveDataset, getUsers } from "../../../lib/db"; // ⬅️ 引入云数据库方法

async function handler(req, res) {
  const sessionUser = req.session.user;
  
  // 🟢 权限判断：为了配合您刚才修改的后台，这里只要登录了就算管理员/有权限
  // 如果您希望更严格，可以改回 user.username === 'admin'
  const isLoggedIn = sessionUser && sessionUser.isLoggedIn;

  // --- GET: 获取数据集列表 ---
  if (req.method === "GET") {
    try {
      // 1. 从云数据库获取所有原始数据 (包含敏感的 baiduLink)
      const datasets = await getDatasets();
      
      // 2. 获取当前用户的购买记录 (从云端最新数据查)
      let purchasedIds = [];
      if (isLoggedIn) {
        const allUsers = await getUsers();
        // 必须去库里查最新的 purchasedIds，session 里的可能是旧的
        const currentUser = allUsers.find(u => u.email === sessionUser.email);
        purchasedIds = currentUser?.purchasedIds || [];
      }

      // 3. 数据脱敏处理 (核心逻辑回归！)
      const processedDatasets = datasets.map(d => {
        // 判断权限：是管理员 OR 已购买 OR 免费资源
        // 注意：这里我们把 d.id 转为 Number 以防类型不匹配
        const isPaid = isLoggedIn && purchasedIds.includes(Number(d.id));
        const isFree = Number(d.price) === 0;
        
        // 只有拥有权限的人，才能看到 baiduLink / downloadUrl
        const hasAccess = isPaid || isFree;
        
        // 把数据库里的 baiduLink 拿出来，暂存到 rest 之外
        const { baiduLink, downloadUrl, ...rest } = d; 
        
        // 优先使用 baiduLink，如果没有就用 downloadUrl (兼容旧数据)
        const realLink = baiduLink || downloadUrl;

        return {
          ...rest,
          // 告诉前端是否已解锁
          isPaid: hasAccess, 
          // 🟢 关键：只有有权限时，才把链接吐给前端，否则给 null
          downloadUrl: hasAccess ? realLink : null 
        };
      });

      return res.status(200).json(processedDatasets);
    } catch (error) {
      console.error("获取数据集失败:", error);
      return res.status(500).json({ message: "获取数据失败" });
    }
  }

  // --- POST: 发布新数据集 (仅限登录用户/管理员) ---
  if (req.method === "POST") {
    // 权限检查
    if (!isLoggedIn) {
      return res.status(401).json({ message: "请先登录后再发布" });
    }

    // 接收前端传来的完整字段 (保留您的 richContent, baiduLink 等)
    const { name, description, richContent, price, currency, tags, baiduLink } = req.body || {};
    
    if (!name || !baiduLink) {
      return res.status(400).json({ message: "名称和下载链接是必填项" });
    }

    const newDataset = {
      id: Date.now(), // 使用时间戳作为唯一ID
      name,
      description,
      richContent,    // ✅ 保留图文详情
      price: Number(price || 0),
      currency: currency || "CNY",
      baiduLink,      // ✅ 保留网盘链接字段
      downloadUrl: baiduLink, // 为了兼容前端逻辑，复制一份给 downloadUrl
      tags: Array.isArray(tags) ? tags : [],
      createdAt: new Date().toISOString(),
      publisher: sessionUser.email // 记录是谁发布的
    };

    try {
      // 💾 保存到云数据库
      await saveDataset(newDataset);
      return res.status(201).json(newDataset);
    } catch (error) {
      console.error("发布数据集失败:", error);
      return res.status(500).json({ message: "发布失败，请重试" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end("Method Not Allowed");
}

export default withIronSessionApiRoute(handler);
