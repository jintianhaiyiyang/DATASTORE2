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
