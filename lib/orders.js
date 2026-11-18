import { kv } from "@vercel/kv";
import { formatUnits } from "./usdt/amount";
import { hashKey, normalizeEmail } from "./security";

// Sorted sets of paid order ids, scored by payment time (ms). Written by the
// fulfillment script; older orders are added by backfillPaidOrders().
export const PAID_ORDERS = "paid_orders";
export const userOrdersKey = (owner) => `user_orders:${owner}`;

const PROVIDER_LABELS = { wechat: "微信支付", alipay: "支付宝", usdt: "USDT" };
const MGET_CHUNK = 100;

function toIdList(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function getOrdersByIds(ids) {
  const orders = [];
  for (let i = 0; i < ids.length; i += MGET_CHUNK) {
    const keys = ids.slice(i, i + MGET_CHUNK).map((id) => `order:${id}`);
    const values = await kv.mget(...keys);
    for (const value of Array.isArray(values) ? values : []) {
      if (value && typeof value === "object" && value.status === "paid") orders.push(value);
    }
  }
  return orders;
}

// Newest first.
export async function listPaidOrders() {
  return getOrdersByIds(toIdList(await kv.zrange(PAID_ORDERS, 0, -1, { rev: true })));
}

export async function listUserOrders(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  return getOrdersByIds(toIdList(await kv.zrange(userOrdersKey(hashKey(normalized)), 0, -1, { rev: true })));
}

function paidAtMs(order) {
  const ms = Date.parse(order?.paidAt || "");
  return Number.isFinite(ms) ? ms : 0;
}

// Indexes paid orders that predate the index. WeChat/Alipay orders used to
// expire after 7 days, so only those still in Redis can be recovered; USDT
// orders were always kept. Safe to run repeatedly.
export async function backfillPaidOrders({ maxKeys = 50000 } = {}) {
  let cursor = "0";
  let scanned = 0;
  let indexed = 0;
  do {
    const [next, keys] = await kv.scan(cursor, { match: "order:*", count: 500 });
    cursor = String(next);
    const list = Array.isArray(keys) ? keys : [];
    scanned += list.length;
    for (let i = 0; i < list.length; i += MGET_CHUNK) {
      const chunk = list.slice(i, i + MGET_CHUNK);
      const values = await kv.mget(...chunk);
      for (const [index, order] of (Array.isArray(values) ? values : []).entries()) {
        if (!order || typeof order !== "object" || order.status !== "paid" || !order.id || !order.email) continue;
        const score = paidAtMs(order) || Date.now();
        await kv.zadd(PAID_ORDERS, { score, member: String(order.id) });
        await kv.zadd(userOrdersKey(hashKey(normalizeEmail(order.email))), { score, member: String(order.id) });
        await kv.persist(chunk[index]);
        indexed++;
      }
    }
  } while (cursor !== "0" && scanned < maxKeys);
  return { indexed, scanned };
}

// Amount actually charged. CNY orders store cents; USDT orders store
// 18-decimal atomic units plus the CNY list price at the time.
export function orderAmount(order) {
  if (order?.provider === "usdt") {
    const atomic = order.actualAtomic || order.expectedAtomic;
    let usdt = null;
    try { usdt = atomic ? formatUnits(String(atomic)) : null; } catch { usdt = null; }
    return { currency: "USDT", cents: null, usdt, atomic: atomic ? String(atomic) : null,
      listCents: Number.isFinite(Number(order.cnyPrice)) ? Math.round(Number(order.cnyPrice) * 100) : null };
  }
  const cents = Number.isSafeInteger(order?.amount) ? order.amount : null;
  return { currency: "CNY", cents, usdt: null, atomic: null, listCents: cents };
}

export function amountText(order) {
  const amount = orderAmount(order);
  if (amount.currency === "USDT") return amount.usdt ? `${amount.usdt} USDT` : "USDT";
  return amount.cents == null ? "—" : `¥${(amount.cents / 100).toFixed(2)}`;
}

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider || "wechat"] || String(provider);
}

// Calendar day in China time, so "今日" matches the shop owner's day.
function shanghaiDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms));
}

export function summarizeOrders(orders, now = Date.now()) {
  const today = shanghaiDay(now);
  const month = today.slice(0, 7);
  const stats = {
    count: 0, cnyCents: 0, usdtAtomic: 0n,
    todayCount: 0, todayCnyCents: 0,
    monthCount: 0, monthCnyCents: 0,
  };
  for (const order of orders) {
    const amount = orderAmount(order);
    const day = shanghaiDay(paidAtMs(order) || now);
    const cents = amount.currency === "CNY" ? amount.cents || 0 : 0;
    stats.count++;
    stats.cnyCents += cents;
    if (amount.atomic) { try { stats.usdtAtomic += BigInt(amount.atomic); } catch { /* ignore malformed */ } }
    if (day === today) { stats.todayCount++; stats.todayCnyCents += cents; }
    if (day.startsWith(month)) { stats.monthCount++; stats.monthCnyCents += cents; }
  }
  return { ...stats, usdt: formatUnits(stats.usdtAtomic.toString()) };
}
