import { normalizeEmail } from "./security";
import { isAlipayPaidState, yuanToCents } from "./alipay";

export function parsePaymentAttach(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isOrderOwner(order, email) {
  return !!order && !!normalizeEmail(email) && normalizeEmail(order.email) === normalizeEmail(email);
}

export function validatePaidOrder({
  order,
  payment,
  attach,
  expectedAppId,
  expectedMchId,
}) {
  if (!order || !payment) return false;
  // Orders created before providers existed are WeChat orders.
  if ((order.provider || "wechat") !== "wechat") return false;
  if (!order.id || !Number.isSafeInteger(order.amount) || order.amount < 1) return false;
  if (payment.trade_state !== "SUCCESS" || !payment.transaction_id) return false;
  if (String(payment.out_trade_no || "") !== String(order.id || "")) return false;
  if (String(attach?.orderId || "") !== String(order.id || "")) return false;
  if (payment.amount?.total !== order.amount) return false;
  if (payment.amount?.currency !== order.currency) return false;
  if (!payment.appid || payment.appid !== (order.appid || expectedAppId)) return false;
  if (!payment.mchid || payment.mchid !== (order.mchid || expectedMchId)) return false;
  return true;
}

// Accepts both the notification (snake_case form fields) and the SDK's
// camelCased query result. `requireAppId` is set for notifications, which
// must name this merchant's app.
export function validateAlipayPaidOrder({
  order,
  trade,
  expectedAppId,
  expectedSellerId,
  requireAppId = false,
}) {
  if (!order || !trade) return false;
  if (order.provider !== "alipay") return false;
  if (!order.id || !Number.isSafeInteger(order.amount) || order.amount < 1) return false;
  if (order.currency !== "CNY") return false;
  const pick = (snake, camel) => trade[snake] ?? trade[camel];
  if (!isAlipayPaidState(pick("trade_status", "tradeStatus"))) return false;
  if (!pick("trade_no", "tradeNo")) return false;
  if (String(pick("out_trade_no", "outTradeNo") || "") !== String(order.id)) return false;
  if (yuanToCents(pick("total_amount", "totalAmount")) !== order.amount) return false;
  const appId = pick("app_id", "appId");
  const expectedApp = order.appid || expectedAppId;
  if (requireAppId && (!appId || appId !== expectedApp)) return false;
  if (appId && appId !== expectedApp) return false;
  if (expectedSellerId && requireAppId && pick("seller_id", "sellerId") !== expectedSellerId) return false;
  return true;
}
