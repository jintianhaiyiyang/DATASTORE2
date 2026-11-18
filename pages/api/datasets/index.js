import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, saveDataset, getPurchasedIds } from "../../../lib/db";
import {
  cleanTags,
  cleanText,
  isHttpUrl,
  sanitizeRichText,
} from "../../../lib/content";
import { randomId, requireSameOrigin } from "../../../lib/security";
import { getStockCounts, isStockMode, parseDigitalFields, presentDataset } from "../../../lib/digital";

async function handler(req, res) {
  const sessionUser = req.session.user;
  const isLoggedIn = !!(sessionUser && sessionUser.isLoggedIn);
  const isAdmin = !!(isLoggedIn && sessionUser.isAdmin);

  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const datasets = await getDatasets();

      let purchasedIds = [];
      if (isLoggedIn && sessionUser.email) {
        purchasedIds = await getPurchasedIds(sessionUser.email);
      }

      const purchased = new Set(purchasedIds.map(String));
      const stockCounts = await getStockCounts(datasets.filter(isStockMode).map((d) => String(d.id)));
      const processedDatasets = datasets.map((d) => presentDataset(d, {
        isAdmin,
        purchased: isLoggedIn && purchased.has(String(d.id)),
        stockCount: stockCounts[String(d.id)],
      }));

      return res.status(200).json(processedDatasets);
    } catch (error) {
      console.error("获取数据集失败:", error);
      return res.status(500).json({ message: "获取数据失败" });
    }
  }

  if (req.method === "POST") {
    if (!requireSameOrigin(req, res)) return;
    if (!isAdmin) {
      return res.status(403).json({ message: "无权操作：需要管理员权限" });
    }

    const { name, description, richContent, price, tags, baiduLink } =
      req.body || {};
    const digital = parseDigitalFields(req.body || {});
    if (digital.error) return res.status(400).json({ message: digital.error });
    const isDigitalItem = digital.patch.category === "digital";

    const safeName = cleanText(name, 120);
    const safeLink = String(baiduLink || "").trim();
    if (!safeName || (!safeLink && !isDigitalItem)) {
      return res.status(400).json({ message: "名称和下载链接是必填项" });
    }
    if (safeLink && !isHttpUrl(safeLink)) {
      return res.status(400).json({ message: "下载链接必须是有效的 HTTPS 地址" });
    }

    const parsedPrice = Number(price || 0);
    if (
      !Number.isFinite(parsedPrice) ||
      parsedPrice < 0 ||
      parsedPrice > 1000000 ||
      Math.round(parsedPrice * 100) / 100 !== parsedPrice
    ) {
      return res.status(400).json({ message: "价格无效" });
    }
    if (String(richContent || "").length > 100000) {
      return res.status(413).json({ message: "详情内容过长" });
    }

    const newDataset = {
      id: randomId("dataset_"),
      name: safeName,
      description: cleanText(description, 1000),
      richContent: sanitizeRichText(richContent),
      price: parsedPrice,
      currency: "CNY",
      baiduLink: safeLink || null,
      downloadUrl: safeLink || null,
      tags: cleanTags(tags),
      category: "dataset",
      ...digital.patch,
      createdAt: new Date().toISOString(),
    };

    try {
      const saved = await saveDataset(newDataset);
      return res.status(201).json(saved);
    } catch (error) {
      console.error("发布数据集失败:", error);
      return res.status(500).json({ message: "发布失败，请重试" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(handler);
