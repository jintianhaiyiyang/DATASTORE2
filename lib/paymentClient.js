// Browser-only helpers: do not import server configuration or payment secrets.
export function getPaymentClientType(env = typeof navigator === "undefined" ? {} : navigator) {
  const ua = env.userAgent || "";
  if (/MicroMessenger/i.test(ua)) return "jsapi";
  if (/Android|iPhone|iPad|iPod/i.test(ua) ||
      (env.platform === "MacIntel" && env.maxTouchPoints > 1)) return "h5";
  return "native";
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
