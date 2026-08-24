import { normalizeEmail } from "./security";

export function parsePaymentAttach(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isOrderOwner(order, email) {
  return !!order && normalizeEmail(order.email) === normalizeEmail(email);
}

export function validatePaidOrder({
  order,
  payment,
  attach,
  expectedAppId,
  expectedMchId,
}) {
  if (!order || !payment) return false;
  if (String(payment.out_trade_no || "") !== String(order.id || "")) return false;
  if (String(attach?.orderId || "") !== String(order.id || "")) return false;
  if (Number(payment.amount?.total) !== Number(order.amount)) return false;
  if (payment.amount?.currency && payment.amount.currency !== order.currency) return false;
  if (expectedAppId && payment.appid !== expectedAppId) return false;
  if (expectedMchId && payment.mchid !== expectedMchId) return false;
  return true;
}
