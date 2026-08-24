import WxPay from "wechatpay-node-v3";
import crypto from "crypto";

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

  if (!appid || !mchid || !apiKey || !wxCert || !wxKey) {
    throw new Error(
      "微信支付配置不完整（WX_APP_ID / WX_MCH_ID / WX_API_V3_KEY / WX_CERT / WX_KEY）"
    );
  }
  if (Buffer.byteLength(apiKey, "utf8") !== 32) {
    throw new Error("WX_API_V3_KEY 必须是 32 字节");
  }
  try {
    crypto.createPublicKey(wxCert);
    crypto.createPrivateKey(wxKey);
  } catch {
    throw new Error("微信支付证书或私钥格式无效");
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
  if (!result || typeof result !== "object") {
    throw new Error("微信支付返回无效");
  }

  const status = Number(result.status);
  if (result.error || (Number.isFinite(status) && (status < 200 || status >= 300))) {
    let providerError = {};
    if (result.error && typeof result.error === "object") {
      providerError = result.error;
    } else if (typeof result.error === "string") {
      try {
        providerError = JSON.parse(result.error);
      } catch {
        providerError = { message: result.error };
      }
    }

    const error = new Error("微信支付请求失败");
    error.name = "WxPayError";
    error.status = Number.isFinite(status) ? status : undefined;
    error.code = String(providerError.code || "").slice(0, 64) || undefined;
    error.providerMessage = String(providerError.message || "")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 300) || undefined;
    throw error;
  }

  return result.data && typeof result.data === "object" ? result.data : result;
}
