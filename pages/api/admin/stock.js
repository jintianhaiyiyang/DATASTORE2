import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets } from "../../../lib/db";
import { requireSameOrigin } from "../../../lib/security";
import {
  addStock,
  clearStock,
  deliverPending,
  getPendingCount,
  getStockCount,
  getStockItems,
  isStockMode,
  parseStockItems,
} from "../../../lib/digital";

// Inventory for stock-mode digital goods (accounts, card keys…).
// GET    ?datasetId=…  → remaining items (first 1000), count, waiting orders
// POST   { datasetId, items }  → append items; waiting paid orders are served first
// DELETE ?datasetId=…  → remove all unsold items
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };

async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.session.user?.isLoggedIn || !req.session.user.isAdmin) {
    return res.status(403).json({ message: "无权操作" });
  }
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (req.method !== "GET" && !requireSameOrigin(req, res)) return;

  const datasetId = String((req.method === "POST" ? req.body?.datasetId : req.query.datasetId) || "");
  if (!datasetId || datasetId.length > 64) return res.status(400).json({ message: "缺少商品 ID" });

  try {
    const product = (await getDatasets()).find((d) => String(d.id) === datasetId);
    if (!product) return res.status(404).json({ message: "商品不存在" });
    if (!isStockMode(product)) return res.status(400).json({ message: "该商品不是库存发货模式" });

    if (req.method === "POST") {
      const parsed = parseStockItems(req.body?.items);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      const { delivered, count } = await addStock(datasetId, parsed.items);
      return res.status(200).json({ added: parsed.items.length, delivered, count, pending: await getPendingCount(datasetId) });
    }
    if (req.method === "DELETE") {
      await clearStock(datasetId);
      return res.status(200).json({ count: 0, pending: await getPendingCount(datasetId) });
    }
    // Retry waiting orders here too, in case an earlier restock was interrupted.
    await deliverPending(datasetId);
    const [items, count, pending] = await Promise.all([
      getStockItems(datasetId), getStockCount(datasetId), getPendingCount(datasetId),
    ]);
    return res.status(200).json({ items, count, pending });
  } catch (error) {
    console.error("库存操作失败:", error?.message || error);
    return res.status(500).json({ message: "库存操作失败，请重试" });
  }
}

export default withIronSessionApiRoute(handler);
