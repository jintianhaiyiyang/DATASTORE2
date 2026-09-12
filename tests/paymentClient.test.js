import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeWechatPayIntent, getH5JumpUrl, getLoginReturnPath, getPaymentClientType, invokeWeChatPay, readCheckoutResponse, rememberWechatPayIntent, safeStorage } from "../lib/paymentClient";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("payment browser compatibility", () => {
  it("preserves the safe merchant permission explanation from checkout", async () => {
    const body = { code: "WECHAT_PAY_NO_AUTH", message: "商家的微信扫码支付权限未开通或不可用，请联系站点管理员。" };
    expect(await readCheckoutResponse(new Response(JSON.stringify(body), { status: 422 }))).toEqual(body);
  });

  it.each([
    [502, "<html>private-upstream-error</html>"], [503, ""], [500, "null"], [400, '{"message":{}}'], [429, '{"message":"  "}'],
  ])("keeps HTTP %s visible when the checkout error body cannot be used", async (status, body) => {
    const data = await readCheckoutResponse(new Response(body, { status }));
    expect(data.message).toContain(`HTTP ${status}`);
    expect(data.message).not.toContain("private-upstream-error");
  });

  it.each(["null", "[]", "<html>error</html>"])("rejects an invalid success response without continuing payment", async (body) => {
    await expect(readCheckoutResponse(new Response(body))).rejects.toThrow("支付服务响应异常");
  });

  it("resumes an explicit OAuth purchase exactly once for the same account and resource", () => {
    const values = new Map();
    vi.stubGlobal("window", { sessionStorage: {
      setItem: (key, value) => values.set(key, value),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    } });
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(false);
    rememberWechatPayIntent("buyer:resource1");
    expect(consumeWechatPayIntent("other:resource1")).toBe(false);
    expect(consumeWechatPayIntent("buyer:resource2")).toBe(false);
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(true);
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(false);
  });

  it("does not resume an expired purchase or a purchase from another tab", () => {
    vi.useFakeTimers();
    const values = new Map();
    const storage = {
      setItem: (key, value) => values.set(key, value),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    };
    vi.stubGlobal("window", { sessionStorage: storage });
    rememberWechatPayIntent("buyer:resource1");
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(false);
    rememberWechatPayIntent("buyer:resource1");
    vi.stubGlobal("window", { sessionStorage: { getItem: () => null, removeItem: () => {} } });
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(false);
  });

  it("keeps manual payment available when session storage is denied", () => {
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("SecurityError"); } });
    expect(() => rememberWechatPayIntent("buyer:resource1")).not.toThrow();
    expect(consumeWechatPayIntent("buyer:resource1")).toBe(false);
  });

  it.each([
    [{ userAgent: "Mozilla iPhone Safari" }, "h5"],
    [{ userAgent: "Mozilla Android Chrome" }, "h5"],
    [{ userAgent: "Mozilla Macintosh Safari", platform: "MacIntel", maxTouchPoints: 5 }, "h5"],
    [{ userAgent: "Mozilla iPad MicroMessenger" }, "jsapi"],
    [{ userAgent: "MicroMessenger WindowsWechat" }, "jsapi"],
    [{ userAgent: "Mozilla Macintosh Safari", platform: "MacIntel", maxTouchPoints: 0 }, "native"],
  ])("selects the appropriate channel for %j", (env, expected) => {
    expect(getPaymentClientType(env)).toBe(expected);
  });

  it("preserves the order on an H5 return even when storage is blocked", () => {
    const jump = new URL(getH5JumpUrl("https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test&redirect_url=old", "https://shop.example/dataset/abc?wechatPay=ready#details", "ORDER_123"));
    expect(jump.searchParams.get("prepay_id")).toBe("test");
    const back = new URL(jump.searchParams.get("redirect_url"));
    expect(back.origin).toBe("https://shop.example");
    expect(back.searchParams.get("payOrder")).toBe("ORDER_123");
    expect(back.searchParams.has("wechatPay")).toBe(false);
    expect(back.hash).toBe("");
    vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError"); } });
    expect(() => safeStorage("set", "pending", "ORDER_123")).not.toThrow();
    expect(safeStorage("get", "pending")).toBeNull();
    expect(() => safeStorage("remove", "pending")).not.toThrow();
  });

  it.each(["javascript:alert(1)", "https://wx.tenpay.com.evil.example/pay", "https://user@wx.tenpay.com/pay"]) ("rejects unsafe H5 URL %s", (url) => {
    expect(() => getH5JumpUrl(url, "https://shop.example/dataset/a", "ORDER_123")).toThrow();
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "/login?next=/login"]) ("rejects unsafe login return %s", (value) => {
    expect(getLoginReturnPath(value)).toBe("/");
  });
  it("returns a buyer to their original resource", () => {
    expect(getLoginReturnPath("/dataset/123?payOrder=ORDER_123")).toBe("/dataset/123?payOrder=ORDER_123");
  });

  it("waits for the WeChat bridge and invokes it only once", async () => {
    vi.useFakeTimers();
    const doc = new EventTarget();
    const browser = {};
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", browser);
    const pending = invokeWeChatPay({ package: "prepay_id=test" });
    const invoke = vi.fn((_name, _params, callback) => callback({ err_msg: "get_brand_wcpay_request:cancel" }));
    browser.WeixinJSBridge = { invoke };
    doc.dispatchEvent(new Event("WeixinJSBridgeReady"));
    doc.dispatchEvent(new Event("WeixinJSBridgeReady"));
    expect(await pending).toBe("get_brand_wcpay_request:cancel");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a missing bridge and removes its late-event handler", async () => {
    vi.useFakeTimers();
    const doc = new EventTarget();
    const browser = {};
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", browser);
    const result = expect(invokeWeChatPay({})).rejects.toThrow("扫码支付");
    await vi.advanceTimersByTimeAsync(8000);
    await result;
    browser.WeixinJSBridge = { invoke: vi.fn() };
    doc.dispatchEvent(new Event("WeixinJSBridgeReady"));
    expect(browser.WeixinJSBridge.invoke).not.toHaveBeenCalled();
  });

  it("does not invoke payment after navigation aborts bridge setup", async () => {
    const doc = new EventTarget();
    const browser = {};
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", browser);
    const controller = new AbortController();
    const result = expect(invokeWeChatPay({}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await result;
    browser.WeixinJSBridge = { invoke: vi.fn() };
    doc.dispatchEvent(new Event("WeixinJSBridgeReady"));
    expect(browser.WeixinJSBridge.invoke).not.toHaveBeenCalled();
  });
});
