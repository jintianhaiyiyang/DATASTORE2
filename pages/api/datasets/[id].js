import { withIronSessionApiRoute } from "../../../lib/session";
import {
  getDatasets,
  updateDataset,
  deleteDataset,
  getPurchasedIds,
} from "../../../lib/db";
import {
  cleanTags,
  cleanText,
  isHttpUrl,
  sanitizeRichText,
} from "../../../lib/content";
import { requireSameOrigin } from "../../../lib/security";

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
      res.setHeader("Cache-Control", "private, no-store");
      const datasets = await getDatasets();
      const dataset = datasets.find((d) => String(d.id) === String(id));
      if (!dataset) return res.status(404).json({ message: "资源不存在" });

      let purchasedIds = [];
      if (isLoggedIn && user.email) {
        purchasedIds = await getPurchasedIds(user.email);
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
    if (!requireSameOrigin(req, res)) return;
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });

    try {
      const body = req.body || {};
      const patch = {};

      if (body.name !== undefined) {
        const safeName = cleanText(body.name, 120);
        if (!safeName) {
          return res.status(400).json({ message: "名称不能为空" });
        }
        patch.name = safeName;
      }
      if (body.description !== undefined) {
        patch.description = cleanText(body.description, 1000);
      }
      if (body.richContent !== undefined) {
        if (String(body.richContent).length > 100000) {
          return res.status(413).json({ message: "详情内容过长" });
        }
        patch.richContent = sanitizeRichText(body.richContent);
      }
      if (body.price !== undefined) {
        const parsedPrice = Number(body.price);
        if (
          !Number.isFinite(parsedPrice) ||
          parsedPrice < 0 ||
          parsedPrice > 1000000 ||
          Math.round(parsedPrice * 100) / 100 !== parsedPrice
        ) {
          return res.status(400).json({ message: "价格无效" });
        }
        patch.price = parsedPrice;
      }
      if (body.currency !== undefined && body.currency !== "CNY") {
        return res.status(400).json({ message: "当前仅支持 CNY" });
      }
      if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
      if (body.baiduLink !== undefined) {
        const safeLink = String(body.baiduLink).trim();
        if (!isHttpUrl(safeLink)) {
          return res.status(400).json({ message: "下载链接必须是有效的 HTTPS 地址" });
        }
        patch.baiduLink = safeLink;
        patch.downloadUrl = patch.baiduLink;
      }

      patch.updatedAt = new Date().toISOString();

      const updated = await updateDataset(id, patch);
      if (updated) return res.json(updated);
      return res.status(404).json({ message: "更新失败，未找到该数据集" });
    } catch (e) {
      console.error("更新数据集失败:", e);
      return res.status(500).json({ message: "更新失败，请稍后重试" });
    }
  }

  if (req.method === "DELETE") {
    if (!requireSameOrigin(req, res)) return;
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });

    try {
      const deleted = await deleteDataset(id);
      if (!deleted) return res.status(404).json({ message: "资源不存在或已删除" });
      return res.json({ success: true });
    } catch (e) {
      console.error("删除数据集失败:", e);
      return res.status(500).json({ message: "删除失败，请稍后重试" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(handler);
