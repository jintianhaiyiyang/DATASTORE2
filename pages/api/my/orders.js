import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, getPurchasedIds } from "../../../lib/db";
import { getDeliveries, isStockMode, presentDataset } from "../../../lib/digital";
import { amountText, listUserOrders, providerLabel } from "../../../lib/orders";
import { consumeRateLimit } from "../../../lib/rateLimit";
import { hashKey, normalizeEmail } from "../../../lib/security";

// "我的订单": everything the signed-in buyer owns, grouped by product, with
// the same delivery content the product page would show them.
async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  const user = req.session.user;
  if (!user?.isLoggedIn) return res.status(401).json({ message: "请先登录" });
  const email = normalizeEmail(user.email);
  if (!email) return res.status(200).json({ items: [] });

  try {
    const rate = await consumeRateLimit(`rate:my-orders:${hashKey(email)}`, { limit: 60, windowSeconds: 60 });
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter));
      return res.status(429).json({ message: "请求过于频繁，请稍后再试" });
    }
    const [datasets, purchasedIds, orders] = await Promise.all([
      getDatasets(), getPurchasedIds(email), listUserOrders(email),
    ]);
    const products = new Map(datasets.map((d) => [String(d.id), d]));
    const groups = new Map();
    const group = (datasetId) => {
      if (!groups.has(datasetId)) groups.set(datasetId, { datasetId, orders: [] });
      return groups.get(datasetId);
    };
    for (const order of orders) {
      group(String(order.datasetId)).orders.push({
        id: String(order.id),
        provider: providerLabel(order.provider),
        amount: amountText(order),
        paidAt: order.paidAt || null,
        productName: order.productName || null,
      });
    }
    // Purchases made before orders were indexed still appear, without order rows.
    for (const id of purchasedIds) group(String(id));

    const items = await Promise.all([...groups.values()].map(async (entry) => {
      const product = products.get(entry.datasetId);
      if (!product) {
        return { ...entry, available: false, name: entry.orders[0]?.productName || "已下架的商品", category: null };
      }
      const view = presentDataset(product, {
        purchased: true,
        deliveries: isStockMode(product) ? await getDeliveries(email, product.id) : undefined,
      });
      return {
        ...entry,
        available: true,
        name: view.name,
        category: view.category,
        deliveryMode: view.deliveryMode || null,
        downloadUrl: view.downloadUrl || null,
        deliveryContent: view.deliveryContent || null,
        deliveries: view.deliveries || null,
        isPaid: view.isPaid,
      };
    }));
    const latest = (item) => item.orders[0]?.paidAt || "";
    items.sort((a, b) => latest(b).localeCompare(latest(a)));
    return res.status(200).json({ items });
  } catch (error) {
    console.error("读取我的订单失败:", error?.message || error);
    return res.status(500).json({ message: "订单加载失败，请重试" });
  }
}

export default withIronSessionApiRoute(handler);
