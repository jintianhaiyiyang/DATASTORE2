import { getOrder, markOrderPaid, updateUserPurchase } from "../../../lib/db";
import { createAlipay, isAlipayPaidState } from "../../../lib/alipay";
import { validateAlipayPaidOrder } from "../../../lib/orderValidation";
import { readRawBody } from "../../../lib/rawBody";

export const config = {
  api: { bodyParser: false },
};

// Alipay expects the literal text "success"; anything else is retried.
function reply(res, status, text) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(status).send(text);
}

/**
 * Alipay asynchronous payment notification (application/x-www-form-urlencoded).
 */
export default async function alipayNotify(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return reply(res, 405, "fail");
  }

  try {
    const alipay = createAlipay();
    const params = Object.fromEntries(new URLSearchParams(await readRawBody(req, 64 * 1024)));

    // URLSearchParams already decoded the values, so verify in raw mode to
    // avoid decoding them a second time.
    if (!params.sign || !alipay.checkNotifySign(params, true)) {
      return reply(res, 401, "fail");
    }

    if (isAlipayPaidState(params.trade_status)) {
      const order = params.out_trade_no ? await getOrder(params.out_trade_no) : null;
      if (!validateAlipayPaidOrder({
        order,
        trade: params,
        expectedAppId: process.env.ALIPAY_APP_ID,
        expectedSellerId: process.env.ALIPAY_SELLER_ID,
        requireAppId: true,
      })) {
        console.error("[alipay notify] 订单数据校验失败", params.out_trade_no || "unknown");
        return reply(res, 409, "fail");
      }
      if (order.status !== "paid") {
        const granted = await updateUserPurchase(order.email, order.datasetId);
        if (!granted) throw new Error("购买权限保存失败");
        await markOrderPaid(order.id, params.trade_no);
      }
    }

    return reply(res, 200, "success");
  } catch (error) {
    console.error("[alipay notify] error:", error?.message || error);
    return reply(res, 500, "fail");
  }
}
