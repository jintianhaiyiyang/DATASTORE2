import crypto from "crypto";
import { AlipaySdk } from "alipay-sdk";

// Only Alipay's own gateways may receive signed requests or be offered to
// browsers as a payment page.
export const ALIPAY_GATEWAY_HOSTS = ["openapi.alipay.com", "openapi-sandbox.dl.alipaydev.com"];
const DEFAULT_GATEWAY = "https://openapi.alipay.com/gateway.do";
const PAID_STATES = new Set(["TRADE_SUCCESS", "TRADE_FINISHED"]);

// Accept PEM (with or without armor, "\n"-escaped for one-line env vars)
// and return the bare base64 body the SDK re-wraps itself.
function keyBody(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s+/g, "");
}

export function detectPrivateKeyType(value) {
  const der = Buffer.from(keyBody(value), "base64");
  for (const type of ["pkcs8", "pkcs1"]) {
    try {
      crypto.createPrivateKey({ key: der, format: "der", type });
      return type.toUpperCase();
    } catch {
      // try the next encoding
    }
  }
  return null;
}

function resolveGateway(value) {
  const url = new URL(value || DEFAULT_GATEWAY);
  if (url.protocol !== "https:" || !ALIPAY_GATEWAY_HOSTS.includes(url.hostname)) {
    throw new Error("ALIPAY_GATEWAY 必须是支付宝官方 HTTPS 网关");
  }
  return url.toString();
}

export function createAlipay(env = process.env) {
  const appId = env.ALIPAY_APP_ID;
  const privateKey = keyBody(env.ALIPAY_PRIVATE_KEY);
  const alipayPublicKey = keyBody(env.ALIPAY_PUBLIC_KEY);
  if (!appId || !privateKey || !alipayPublicKey) {
    throw new Error("支付宝配置不完整（ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY）");
  }
  const keyType = detectPrivateKeyType(privateKey);
  if (!keyType) throw new Error("ALIPAY_PRIVATE_KEY 不是有效的 RSA 私钥");
  try {
    crypto.createPublicKey({ key: Buffer.from(alipayPublicKey, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("ALIPAY_PUBLIC_KEY 不是有效的支付宝公钥");
  }
  return new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    keyType,
    gateway: resolveGateway(env.ALIPAY_GATEWAY),
    timeout: 10000,
  });
}

export function centsToYuan(cents) {
  return (cents / 100).toFixed(2);
}

export function yuanToCents(value) {
  const text = String(value ?? "");
  return /^\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : NaN;
}

// Alipay rejects "/", "=" and "&" in subjects.
export function alipaySubject(name) {
  return `购买: ${String(name || "数字资源").replace(/[/=&\\]/g, " ")}`.slice(0, 120);
}

/**
 * Sign a page (desktop) or wap (mobile browser) payment request and return
 * the Alipay cashier URL. Nothing is sent to Alipay until the browser opens it.
 */
export function createAlipayPayUrl(sdk, { type, orderId, amount, subject, notifyUrl, returnUrl }) {
  const wap = type === "wap";
  const bizContent = {
    out_trade_no: orderId,
    total_amount: centsToYuan(amount),
    subject,
    product_code: wap ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY",
    // Unpaid cashier sessions expire instead of staying payable forever.
    timeout_express: "30m",
  };
  if (wap) bizContent.quit_url = returnUrl;
  return sdk.pageExecute(wap ? "alipay.trade.wap.pay" : "alipay.trade.page.pay", "GET", {
    bizContent,
    notifyUrl,
    returnUrl,
  });
}

function alipayError(result) {
  const error = new Error("支付宝请求失败");
  error.name = "AlipayError";
  error.code = String(result?.subCode || result?.code || "").slice(0, 64) || undefined;
  error.providerMessage = String(result?.subMsg || result?.msg || "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300) || undefined;
  return error;
}

export async function queryAlipayTrade(sdk, outTradeNo) {
  const result = await sdk.exec(
    "alipay.trade.query",
    { bizContent: { out_trade_no: outTradeNo } },
    { validateSign: true }
  );
  if (result?.code === "10000") return result;
  // The trade is created only once the buyer opens the cashier.
  if (result?.subCode === "ACQ.TRADE_NOT_EXIST") {
    return { outTradeNo, tradeStatus: "TRADE_NOT_EXIST" };
  }
  throw alipayError(result);
}

export async function closeAlipayTrade(sdk, outTradeNo) {
  const result = await sdk.exec(
    "alipay.trade.close",
    { bizContent: { out_trade_no: outTradeNo } },
    { validateSign: true }
  );
  if (result?.code === "10000" || result?.subCode === "ACQ.TRADE_NOT_EXIST") return;
  throw alipayError(result);
}

export function isAlipayPaidState(state) {
  return PAID_STATES.has(state);
}

/** Map Alipay trade states onto the states the payment panel understands. */
export function toClientTradeState(state) {
  if (state === "WAIT_BUYER_PAY" || state === "TRADE_NOT_EXIST") return "NOTPAY";
  if (state === "TRADE_CLOSED") return "CLOSED";
  return null;
}
