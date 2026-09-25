import { withIronSessionApiRoute } from "../../lib/session";
import {
  getOrder,
  markOrderPaid,
  updateUserPurchase,
} from "../../lib/db";
import { createWxPay, unwrapWxResult } from "../../lib/wxpay";
import { createAlipay, isAlipayPaidState, queryAlipayTrade, toClientTradeState } from "../../lib/alipay";
import { consumeRateLimit } from "../../lib/rateLimit";
import { hashKey } from "../../lib/security";
import {
  isOrderOwner,
  parsePaymentAttach,
  validateAlipayPaidOrder,
  validatePaidOrder,
} from "../../lib/orderValidation";

// Returns { paid, transactionId, state } or null when the provider's trade
// does not match the local order.
async function queryAlipay(order) {
  const trade = await queryAlipayTrade(createAlipay(), order.id);
  if (!isAlipayPaidState(trade.tradeStatus)) {
    return { paid: false, state: toClientTradeState(trade.tradeStatus) };
  }
  if (!validateAlipayPaidOrder({ order, trade, expectedAppId: process.env.ALIPAY_APP_ID })) return null;
  return { paid: true, transactionId: trade.tradeNo };
}

async function queryWechat(order) {
  const data = unwrapWxResult(await createWxPay().query({ out_trade_no: order.id }));
  if (data.trade_state !== "SUCCESS") {
    return { paid: false, state: data.trade_state || null };
  }
  const attach = parsePaymentAttach(data.attach);
  if (!validatePaidOrder({ order, payment: data, attach,
    expectedAppId: process.env.WX_APP_ID, expectedMchId: process.env.WX_MCH_ID })) return null;
  return { paid: true, transactionId: data.transaction_id };
}

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ paid: false, message: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const user = req.session.user;
  if (!user || !user.isLoggedIn) {
    return res.status(401).json({ paid: false });
  }

  const orderId = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
  if (!orderId || orderId.length > 64) {
    return res.status(400).json({ paid: false, message: "无效的订单号" });
  }

  try {
    const order = await getOrder(orderId);
    if (!isOrderOwner(order, user.email)) {
      return res.status(404).json({ paid: false, message: "订单不存在" });
    }
    if (order.status === "paid") return res.status(200).json({ paid: true });

    const rate = await consumeRateLimit(
      `rate:order-query:${hashKey(`${user.email}:${orderId}`)}`,
      { limit: 180, windowSeconds: 5 * 60 }
    );
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter));
      return res.status(429).json({ paid: false, message: "查询过于频繁" });
    }

    // Orders created before Alipay support are WeChat orders.
    const result = order.provider === "alipay" ? await queryAlipay(order) : await queryWechat(order);
    if (!result) {
      console.error("[查询订单] 支付平台订单数据与本地订单不一致", orderId);
      return res.status(409).json({ paid: false, message: "订单数据校验失败" });
    }
    if (!result.paid) {
      return res.status(200).json({ paid: false, state: result.state });
    }

    const granted = await updateUserPurchase(order.email, order.datasetId);
    if (!granted) throw new Error("购买权限保存失败");
    await markOrderPaid(orderId, result.transactionId);
    return res.status(200).json({ paid: true });
  } catch (error) {
    console.error("[查询报错] 接口异常:", error.message);
    return res.status(500).json({ paid: false, message: "订单查询失败" });
  }
}

export default withIronSessionApiRoute(handler);
