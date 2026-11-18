// Client-safe: turns a product view (from /api/datasets/:id or
// /api/my/orders) into rows for DeliveryDialog.
// What the buyer received. orderId narrows a stock product to that order.
export function deliveryEntries(dataset, orderId) {
  if (dataset?.category !== "digital") return [];
  if (dataset.deliveryMode === "stock") {
    const all = Array.isArray(dataset.deliveries) ? dataset.deliveries : [];
    const list = orderId ? all.filter((entry) => entry.orderId === orderId) : all;
    return list.map((entry, index) => ({
      key: entry.orderId,
      label: list.length > 1 ? `第 ${list.length - index} 次购买` : "订单内容",
      text: entry.item,
      pending: entry.pending,
      time: entry.deliveredAt || entry.paidAt,
    }));
  }
  if (!dataset.isPaid) return [];
  const entries = [];
  if (dataset.deliveryContent) entries.push({ key: "content", text: dataset.deliveryContent });
  if (typeof dataset.downloadUrl === "string" && /^https:\/\//i.test(dataset.downloadUrl)) {
    entries.push({ key: "link", label: "下载链接", text: dataset.downloadUrl });
  }
  return entries;
}
