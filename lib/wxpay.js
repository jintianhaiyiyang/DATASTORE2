import WxPay from "wechatpay-node-v3";

/**
 * Create a configured WeChat Pay client from environment variables.
 * Certificates may be stored as single-line env values with "\\n" escapes.
 */
export function createWxPay() {
  const appid = process.env.WX_APP_ID;
  const mchid = process.env.WX_MCH_ID;
  const apiKey = process.env.WX_API_V3_KEY;
  const wxCert = (process.env.WX_CERT || "").replace(/\\n/g, "\n");
  const wxKey = (process.env.WX_KEY || "").replace(/\\n/g, "\n");

  if (!appid || !mchid || !wxCert || !wxKey) {
    throw new Error("微信支付配置不完整（WX_APP_ID / WX_MCH_ID / WX_CERT / WX_KEY）");
  }

  return new WxPay({
    appid,
    mchid,
    publicKey: Buffer.from(wxCert),
    privateKey: Buffer.from(wxKey),
    key: apiKey,
  });
}

/**
 * Normalize wechatpay-node-v3 response shapes (data may be nested).
 */
export function unwrapWxResult(result) {
  if (!result || typeof result !== "object") return {};
  return result.data && typeof result.data === "object" ? result.data : result;
}
