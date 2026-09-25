import {
  getOrder,
  markOrderPaid,
  updateUserPurchase,
} from "../../../lib/db";
import { createWxPay } from "../../../lib/wxpay";
import { readRawBody } from "../../../lib/rawBody";
import {
  parsePaymentAttach,
  validatePaidOrder,
} from "../../../lib/orderValidation";

export const config = {
  api: { bodyParser: false },
};

/**
 * WeChat Pay APIv3 payment notification callback.
 * Must respond with { code: "SUCCESS" } on success.
 */
export default async function wechatNotify(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ code: "FAIL", message: "Method Not Allowed" });
  }

  try {
    const wxpay = createWxPay();

    const timestamp = req.headers["wechatpay-timestamp"];
    const nonce = req.headers["wechatpay-nonce"];
    const signature = req.headers["wechatpay-signature"];
    const serial = req.headers["wechatpay-serial"];

    if (!timestamp || !nonce || !signature || !serial) {
      return res.status(400).json({ code: "FAIL", message: "缺少验签头" });
    }

    const rawBody = await readRawBody(req);
    const isValid = await wxpay.verifySign({
      timestamp,
      nonce,
      body: rawBody,
      serial,
      signature,
      apiSecret: process.env.WX_API_V3_KEY,
    });

    if (!isValid) {
      return res.status(401).json({ code: "FAIL", message: "签名校验失败" });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ code: "FAIL", message: "请求体无效" });
    }

    const resource = body?.resource;
    if (!resource?.ciphertext || !resource?.nonce) {
      return res.status(400).json({ code: "FAIL", message: "缺少 resource" });
    }

    const data = wxpay.decipher_gcm(
      resource.ciphertext,
      resource.associated_data || "",
      resource.nonce
    );

    if (data && data.trade_state === "SUCCESS") {
      const attach = parsePaymentAttach(data.attach);

      const orderId = data.out_trade_no;
      const order = orderId ? await getOrder(orderId) : null;
      if (!validatePaidOrder({
        order,
        payment: data,
        attach,
        expectedMchId: process.env.WX_MCH_ID,
        expectedAppId: process.env.WX_APP_ID,
      })) {
        console.error("[wechat notify] 订单数据校验失败", orderId || "unknown");
        return res.status(409).json({ code: "FAIL", message: "订单数据校验失败" });
      }
      if (order.status !== "paid") {
        const granted = await updateUserPurchase(order.email, order.datasetId);
        if (!granted) throw new Error("购买权限保存失败");
        await markOrderPaid(orderId, data.transaction_id);
      }
    }

    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[wechat notify] error:", error);
    return res.status(500).json({ code: "FAIL", message: "处理失败" });
  }
}
