import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, saveDataset, getUsers } from "../../../lib/db";

function hasPurchased(purchasedIds, datasetId) {
  if (!Array.isArray(purchasedIds)) return false;
  const target = String(datasetId);
  return purchasedIds.map(String).includes(target);
}

async function handler(req, res) {
  const sessionUser = req.session.user;
  const isLoggedIn = !!(sessionUser && sessionUser.isLoggedIn);
  const isAdmin = !!(isLoggedIn && sessionUser.isAdmin);

  if (req.method === "GET") {
    try {
      const datasets = await getDatasets();

      let purchasedIds = [];
      if (isLoggedIn && sessionUser.email) {
        const allUsers = await getUsers();
        const currentUser = allUsers.find((u) => u.email === sessionUser.email);
        purchasedIds = currentUser?.purchasedIds || [];
      }

      const processedDatasets = datasets.map((d) => {
        const isPaid = isLoggedIn && hasPurchased(purchasedIds, d.id);
        const isFree = Number(d.price) === 0;
        const hasAccess = isPaid || isFree || isAdmin;

        const { baiduLink, downloadUrl, ...rest } = d;
        const realLink = baiduLink || downloadUrl;

        // Admins get the real link for editing; buyers/free users get downloadUrl only
        if (isAdmin) {
          return {
            ...rest,
            isPaid: true,
            baiduLink: realLink || null,
            downloadUrl: realLink || null,
          };
        }

        return {
          ...rest,
          isPaid: hasAccess,
          downloadUrl: hasAccess ? realLink : null,
        };
      });

      return res.status(200).json(processedDatasets);
    } catch (error) {
      console.error("获取数据集失败:", error);
      return res.status(500).json({ message: "获取数据失败" });
    }
  }

  if (req.method === "POST") {
    if (!isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    const { name, description, richContent, price, currency, tags, baiduLink } =
      req.body || {};

    if (!name || !baiduLink) {
      return res.status(400).json({ message: "名称和下载链接是必填项" });
    }

    const parsedPrice = Number(price || 0);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "价格无效" });
    }

    const newDataset = {
      id: Date.now(),
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      richContent: richContent ? String(richContent) : "",
      price: parsedPrice,
      currency: currency || "CNY",
      baiduLink: String(baiduLink).trim(),
      downloadUrl: String(baiduLink).trim(),
      tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
      createdAt: new Date().toISOString(),
      publisher: sessionUser.email || sessionUser.username || "admin",
    };

    try {
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
