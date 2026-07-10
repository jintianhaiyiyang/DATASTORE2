import { withIronSessionApiRoute } from "../../../lib/session";
import {
  getDatasets,
  updateDataset,
  deleteDataset,
  getUsers,
} from "../../../lib/db";

function hasPurchased(purchasedIds, datasetId) {
  if (!Array.isArray(purchasedIds)) return false;
  const target = String(datasetId);
  return purchasedIds.map(String).includes(target);
}

async function handler(req, res) {
  const { id } = req.query;
  const user = req.session.user;
  const isLoggedIn = !!(user && user.isLoggedIn);
  const isAdmin = !!(isLoggedIn && user.isAdmin);

  if (req.method === "GET") {
    try {
      const datasets = await getDatasets();
      const dataset = datasets.find((d) => String(d.id) === String(id));
      if (!dataset) return res.status(404).json({ message: "资源不存在" });

      let purchasedIds = [];
      if (isLoggedIn && user.email) {
        const allUsers = await getUsers();
        const currentUser = allUsers.find((u) => u.email === user.email);
        purchasedIds = currentUser?.purchasedIds || [];
      }

      const isPaid = isLoggedIn && hasPurchased(purchasedIds, id);
      const isFree = Number(dataset.price) === 0;
      const hasAccess = isPaid || isFree || isAdmin;

      const { baiduLink, downloadUrl, ...rest } = dataset;
      const realLink = baiduLink || downloadUrl;

      if (isAdmin) {
        return res.json({
          ...rest,
          isPaid: true,
          baiduLink: realLink || null,
          downloadUrl: realLink || null,
        });
      }

      return res.json({
        ...rest,
        isPaid: hasAccess,
        downloadUrl: hasAccess ? realLink : null,
      });
    } catch (error) {
      console.error("获取数据集详情失败:", error);
      return res.status(500).json({ message: "服务器内部错误" });
    }
  }

  if (req.method === "PUT") {
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });

    try {
      const body = req.body || {};
      const patch = {};

      if (body.name !== undefined) {
        if (!String(body.name).trim()) {
          return res.status(400).json({ message: "名称不能为空" });
        }
        patch.name = String(body.name).trim();
      }
      if (body.description !== undefined) {
        patch.description = String(body.description).trim();
      }
      if (body.richContent !== undefined) {
        patch.richContent = String(body.richContent);
      }
      if (body.price !== undefined) {
        const parsedPrice = Number(body.price);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ message: "价格无效" });
        }
        patch.price = parsedPrice;
      }
      if (body.currency !== undefined) patch.currency = body.currency || "CNY";
      if (body.tags !== undefined) {
        patch.tags = Array.isArray(body.tags)
          ? body.tags.map(String).filter(Boolean)
          : [];
      }
      if (body.baiduLink !== undefined) {
        if (!String(body.baiduLink).trim()) {
          return res.status(400).json({ message: "下载链接不能为空" });
        }
        patch.baiduLink = String(body.baiduLink).trim();
        patch.downloadUrl = patch.baiduLink;
      }

      patch.updatedAt = new Date().toISOString();

      const updated = await updateDataset(id, patch);
      if (updated) return res.json(updated);
      return res.status(404).json({ message: "更新失败，未找到该数据集" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  if (req.method === "DELETE") {
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });

    try {
      await deleteDataset(id);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end("Method Not Allowed");
}

export default withIronSessionApiRoute(handler);
