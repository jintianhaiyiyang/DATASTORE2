// Browser-only helpers: do not import server configuration or payment secrets.
export function getPaymentClientType(env = typeof navigator === "undefined" ? {} : navigator) {
  const ua = env.userAgent || "";
  if (/MicroMessenger/i.test(ua)) return "jsapi";
  if (/Android|iPhone|iPad|iPod/i.test(ua) ||
      (env.platform === "MacIntel" && env.maxTouchPoints > 1)) return "h5";
  return "native";
}

// Proxies and serverless runtimes can return HTML or an empty error body.
// Keep an actionable HTTP status without displaying an upstream error page.
export async function readCheckoutResponse(response) {
  const data = await response.json().catch(() => null);
  const isObject = data !== null && typeof data === "object" && !Array.isArray(data);
  const message = `支付服务响应异常（HTTP ${response.status}），请联系站点管理员。`;
  if (!response.ok) {
    return {
      ...(isObject ? data : {}),
      message: isObject && typeof data.message === "string" && data.message.trim()
        ? data.message : message,
    };
  }
  if (!isObject) throw new Error(message);
  return data;
}

export function safeStorage(action, key, value) {
  if (typeof window === "undefined" || !key) return null;
  try {
    if (action === "get") return window.localStorage.getItem(key);
    if (action === "set") window.localStorage.setItem(key, value);
    if (action === "remove") window.localStorage.removeItem(key);
  } catch {
    // Private browsing / quota restrictions must never prevent payment.
  }
  return null;
}

// Only resume an explicit purchase from this tab, account and resource. A URL
// containing wechatPay=ready alone must not create an order or open the cashier.
export function rememberWechatPayIntent(key) {
  if (typeof window === "undefined" || !key) return;
  try {
    window.sessionStorage.setItem(`wechatPayResume:${key}`, String(Date.now() + 10 * 60 * 1000));
  } catch {
    // The ordinary pay button remains available if browser storage is blocked.
  }
}

export function consumeWechatPayIntent(key) {
  if (typeof window === "undefined" || !key) return false;
  try {
    const storageKey = `wechatPayResume:${key}`;
    const expiresAt = Number(window.sessionStorage.getItem(storageKey));
    window.sessionStorage.removeItem(storageKey);
    const now = Date.now();
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt <= now + 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function isPaymentOrderId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_*\-]{6,64}$/.test(value);
}

export function getH5JumpUrl(value, returnUrl, orderId) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "wx.tenpay.com" || url.username || url.password) {
    throw new Error("支付链接无效，请使用扫码支付");
  }
  const back = new URL(returnUrl);
  back.hash = "";
  back.searchParams.delete("wechatPay");
  back.searchParams.set("payOrder", orderId);
  url.searchParams.set("redirect_url", back.toString());
  return url.toString();
}

export function getLoginReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const target = new URL(value, "https://datastore.invalid");
    if (target.origin !== "https://datastore.invalid" || target.pathname === "/login") return "/";
    return target.pathname + target.search + target.hash;
  } catch { return "/"; }
}

export function invokeWeChatPay(payParams, signal) {
  return new Promise((resolve, reject) => {
    let invoked = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener("WeixinJSBridgeReady", invoke);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const invoke = () => {
      if (invoked || !window.WeixinJSBridge?.invoke) return;
      invoked = true;
      clearTimeout(timer);
      // Do not impose a timeout while the user is entering their payment PIN.
      document.removeEventListener("WeixinJSBridgeReady", invoke);
      try {
        window.WeixinJSBridge.invoke("getBrandWCPayRequest", payParams, (result) => {
          cleanup();
          resolve(result?.err_msg || result?.errMsg || "");
        });
      } catch (error) { cleanup(); reject(error); }
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    document.addEventListener("WeixinJSBridgeReady", invoke);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("未能连接微信，请使用下方的扫码支付"));
    }, 8000);
    invoke();
  });
}
