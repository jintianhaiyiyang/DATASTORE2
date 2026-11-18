import { kv } from "@vercel/kv";
import { cleanDeliveryText } from "./content";
import { hashKey, normalizeEmail } from "./security";

// 数字商品 (digital goods) reuse the dataset record, orders and payment
// pipeline. Two delivery modes:
//   fixed: every buyer sees the same hidden content (file link, notes…),
//          unlocked once, like a dataset download.
//   stock: each paid order takes exactly one item from a Redis list
//          (accounts, card keys…). The same user may buy again.
export const CATEGORIES = ["dataset", "digital"];
export const DELIVERY_MODES = ["fixed", "stock"];
export const MAX_DELIVERY_CONTENT = 20000;
export const MAX_STOCK_ITEM = 2000;
export const MAX_STOCK_BATCH = 1000;
export const MAX_STOCK_LIST = 1000;

export const stockKey = (datasetId) => `stock:${datasetId}`;
export const pendingKey = (datasetId) => `stock_pending:${datasetId}`;
export const ownerHash = (email) => hashKey(normalizeEmail(email));
export const deliveriesKey = (owner, datasetId) => `deliveries:${owner}:${datasetId}`;

export function isDigital(item) {
  return item?.category === "digital";
}

export function isStockMode(item) {
  return isDigital(item) && item.deliveryMode === "stock";
}

// One item per line. Returns { items } or { error }.
export function parseStockItems(value) {
  const lines = Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\r?\n/);
  const items = lines.map((line) => cleanDeliveryText(line, MAX_STOCK_ITEM + 1)).filter(Boolean);
  if (!items.length) return { error: "请至少填写一条库存，每行一条" };
  if (items.length > MAX_STOCK_BATCH) return { error: `单次最多添加 ${MAX_STOCK_BATCH} 条` };
  if (items.some((item) => item.length > MAX_STOCK_ITEM)) return { error: `每条库存最多 ${MAX_STOCK_ITEM} 个字符` };
  return { items };
}

// Items are stored JSON-encoded so the KV client's automatic
// deserialization cannot turn "000123" into the number 123.
const decodeItem = (value) => {
  if (typeof value !== "string") return value == null ? "" : String(value);
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

export async function getStockCount(datasetId) {
  return Number(await kv.llen(stockKey(datasetId))) || 0;
}

export async function getStockCounts(datasetIds) {
  const counts = await Promise.all(datasetIds.map((id) => getStockCount(id)));
  return Object.fromEntries(datasetIds.map((id, index) => [String(id), counts[index]]));
}

export async function getPendingCount(datasetId) {
  return Number(await kv.llen(pendingKey(datasetId))) || 0;
}

export async function getStockItems(datasetId) {
  const items = await kv.lrange(stockKey(datasetId), 0, MAX_STOCK_LIST - 1);
  return Array.isArray(items) ? items.map(decodeItem) : [];
}

export async function clearStock(datasetId) {
  await kv.del(stockKey(datasetId));
}

// Delivers one item to the oldest paid order that found the stock empty.
// The entry is re-checked inside the script so concurrent callers cannot
// deliver twice or skip a buyer.
export const DELIVER_PENDING = `
if redis.call('LINDEX',KEYS[2],0) ~= ARGV[1] then return -1 end
local raw = redis.call('LPOP',KEYS[1]); if not raw then return 0 end
redis.call('LPOP',KEYS[2])
local ok, item = pcall(cjson.decode, raw); if not ok or type(item) ~= 'string' then item = raw end
local current = redis.call('HGET',KEYS[3],ARGV[2])
local entry = current and cjson.decode(current) or {orderId=ARGV[2]}
entry.item = item; entry.pending = nil; entry.deliveredAt = ARGV[3]
redis.call('HSET',KEYS[3],ARGV[2],cjson.encode(entry))
return 1`;

export async function deliverPending(datasetId) {
  let delivered = 0;
  for (let i = 0; i < MAX_STOCK_BATCH; i++) {
    // Entries are "orderId|ownerHash" (never valid JSON, so the KV client
    // returns them verbatim).
    const head = await kv.lindex(pendingKey(datasetId), 0);
    if (head == null) break;
    const raw = String(head);
    const [orderId, owner] = raw.split("|");
    const result = await kv.eval(DELIVER_PENDING,
      [stockKey(datasetId), pendingKey(datasetId), deliveriesKey(owner, datasetId)],
      [raw, orderId, new Date().toISOString()]);
    if (Number(result) === 0) break;
    if (Number(result) === 1) delivered++;
  }
  return delivered;
}

export async function addStock(datasetId, items) {
  await kv.rpush(stockKey(datasetId), ...items.map((item) => JSON.stringify(item)));
  const delivered = await deliverPending(datasetId);
  return { delivered, count: await getStockCount(datasetId) };
}

function decodeEntry(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

// The buyer's stock deliveries for one product, newest first.
export async function getDeliveries(email, datasetId) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const all = await kv.hgetall(deliveriesKey(ownerHash(normalized), datasetId));
  if (!all || typeof all !== "object") return [];
  return Object.values(all)
    .map(decodeEntry)
    .filter((entry) => entry && entry.orderId)
    .map((entry) => ({
      orderId: String(entry.orderId),
      item: typeof entry.item === "string" ? entry.item : entry.item == null ? null : String(entry.item),
      pending: !!entry.pending && entry.item == null,
      paidAt: entry.paidAt || null,
      deliveredAt: entry.deliveredAt || entry.paidAt || null,
    }))
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
}

// Shapes a stored product for the requesting user. Hidden fields (download
// link, fixed delivery content) are only returned to buyers and admins.
export function presentDataset(dataset, { isAdmin = false, purchased = false, stockCount, deliveries } = {}) {
  const { baiduLink, downloadUrl, deliveryContent, ...rest } = dataset;
  const realLink = baiduLink || downloadUrl || null;
  const stock = isStockMode(dataset);
  const view = { ...rest };
  if (stock) view.stockCount = Number(stockCount) || 0;
  if (isAdmin) {
    return {
      ...view,
      isPaid: true,
      baiduLink: realLink,
      downloadUrl: realLink,
      ...(isDigital(dataset) ? { deliveryContent: deliveryContent || "" } : {}),
      ...(deliveries ? { deliveries } : {}),
    };
  }
  const free = Number(dataset.price) === 0;
  // A stock product is never "free" and is re-purchasable: isPaid only says
  // the user has bought it at least once.
  const hasAccess = stock ? purchased : purchased || free;
  view.isPaid = hasAccess;
  view.downloadUrl = hasAccess && !stock ? realLink : null;
  if (isDigital(dataset) && !stock && hasAccess) view.deliveryContent = deliveryContent || "";
  if (stock && deliveries) view.deliveries = deliveries;
  return view;
}

// Validates admin input for the digital-goods fields. Returns { patch } or
// { error }. `current` is the stored record when editing.
export function parseDigitalFields(body, current = null) {
  const patch = {};
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return { error: "类别无效" };
    patch.category = body.category;
  }
  const category = patch.category ?? current?.category ?? "dataset";
  if (category !== "digital") return { patch };
  if (body.deliveryMode !== undefined) {
    if (!DELIVERY_MODES.includes(body.deliveryMode)) return { error: "发货方式无效" };
    patch.deliveryMode = body.deliveryMode;
  }
  if (body.deliveryContent !== undefined) {
    if (String(body.deliveryContent).length > MAX_DELIVERY_CONTENT) return { error: "发货内容过长" };
    patch.deliveryContent = cleanDeliveryText(body.deliveryContent);
  }
  const mode = patch.deliveryMode ?? current?.deliveryMode ?? "fixed";
  const content = patch.deliveryContent ?? current?.deliveryContent ?? "";
  const price = body.price !== undefined ? Number(body.price) : Number(current?.price ?? 0);
  const link = body.baiduLink !== undefined ? String(body.baiduLink || "").trim() : current?.baiduLink || "";
  if (mode === "stock" && !(price > 0)) return { error: "库存发货的商品价格必须大于 0" };
  if (mode === "fixed" && !content && !link) return { error: "请填写发货内容或下载链接" };
  return { patch };
}
