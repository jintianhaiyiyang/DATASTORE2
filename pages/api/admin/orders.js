import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets } from "../../../lib/db";
import { requireSameOrigin } from "../../../lib/security";
import { amountText, backfillPaidOrders, listPaidOrders, providerLabel, summarizeOrders } from "../../../lib/orders";

const PAGE_SIZE = 30;
export const config = { maxDuration: 60 };

// GET  ?page=1&provider=wechat|alipay|usdt&q=…  → paid orders, newest first, plus totals
// POST { action: "backfill" }                   → index paid orders created before the index existed
async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!req.session.user?.isLoggedIn || !req.session.user.isAdmin) {
    return res.status(403).json({ message: "无权操作" });
  }

  if (req.method === "POST") {
    if (!requireSameOrigin(req, res)) return;
    if (req.body?.action !== "backfill") return res.status(400).json({ message: "未知操作" });
    try {
      return res.status(200).json(await backfillPaidOrders());
    } catch (error) {
      console.error("导入历史订单失败:", error?.message || error);
      return res.status(500).json({ message: "导入失败，请重试" });
    }
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const provider = ["wechat", "alipay", "usdt"].includes(req.query.provider) ? req.query.provider : "";
    const q = String(req.query.q || "").trim().toLowerCase().slice(0, 100);
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const [orders, datasets] = await Promise.all([listPaidOrders(), getDatasets()]);
    const names = new Map(datasets.map((d) => [String(d.id), d.name]));

    const rows = orders.map((order) => ({
      id: String(order.id),
      provider: order.provider || "wechat",
      providerLabel: providerLabel(order.provider),
      datasetId: String(order.datasetId),
      productName: names.get(String(order.datasetId)) || order.productName || "已删除的商品",
      email: order.email || "",
      amount: amountText(order),
      paidAt: order.paidAt || null,
      transactionId: order.transactionId || null,
      deliveryStatus: order.deliveryStatus || null,
      raw: order,
    }));
    const filtered = rows.filter((row) => (!provider || row.provider === provider) && (!q ||
      [row.id, row.email, row.productName, row.transactionId].some((v) => String(v || "").toLowerCase().includes(q))));
    const stats = summarizeOrders(filtered.map((row) => row.raw));
    const start = (page - 1) * PAGE_SIZE;
    return res.status(200).json({
      stats: { ...stats, usdtAtomic: undefined },
      total: filtered.length,
      page,
      pageSize: PAGE_SIZE,
      orders: filtered.slice(start, start + PAGE_SIZE).map(({ raw: _raw, ...row }) => row),
    });
  } catch (error) {
    console.error("读取订单失败:", error?.message || error);
    return res.status(500).json({ message: "订单加载失败，请重试" });
  }
}

export default withIronSessionApiRoute(handler);
