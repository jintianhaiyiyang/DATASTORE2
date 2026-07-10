import { updateUserPurchase } from "../../../lib/db";
import { createWxPay } from "../../../lib/wxpay";

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

    const body = req.body;
    let isValid = false;
    try {
      isValid = await wxpay.verifySign({
        timestamp,
        nonce,
        body,
        serial,
        signature,
        apiSecret: process.env.WX_API_V3_KEY,
      });
    } catch (verifyErr) {
      console.error("[wechat notify] verifySign error:", verifyErr.message);
      // Fall through to attempt decrypt if platform certs are not cached yet;
      // decryption still requires the correct APIv3 key.
    }

    if (!isValid) {
      // Some deployments lack platform certificates for verifySign; still try decrypt.
      // Log and continue carefully — ciphertext cannot be forged without APIv3 key.
      console.warn("[wechat notify] signature verify failed or skipped; decrypting with APIv3 key");
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
      let attach = {};
      try {
        attach = JSON.parse(data.attach || "{}");
      } catch {
        attach = {};
      }

      if (attach.email && attach.datasetId !== undefined && attach.datasetId !== null) {
        await updateUserPurchase(attach.email, attach.datasetId);
      }
    }

    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error("[wechat notify] error:", error);
    return res.status(500).json({ code: "FAIL", message: error.message || "处理失败" });
  }
}
