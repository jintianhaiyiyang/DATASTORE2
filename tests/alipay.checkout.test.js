import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { getDatasets: vi.fn(), getSiteSettings: vi.fn(), getPurchasedIds: vi.fn(), getOrder: vi.fn(), saveOrder: vi.fn(), updateUserPurchase: vi.fn(), markOrderPaid: vi.fn() },
  sdk: { exec: vi.fn(), pageExecute: vi.fn() },
  rate: vi.fn(),
}));
vi.mock("../lib/session", () => ({ withIronSessionApiRoute: (handler) => handler }));
vi.mock("../lib/db", () => mocks.db);
vi.mock("../lib/rateLimit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("../lib/alipay", async (importOriginal) => ({ ...await importOriginal(), createAlipay: () => mocks.sdk }));

import checkout from "../pages/api/checkout";
import checkOrder from "../pages/api/check-order";

const dataset = { id: "resource1", name: "城市/人口=数据&统计", price: 9.9 };
const order = { id: "ORDER_alipay0001", provider: "alipay", datasetId: "resource1", email: "buyer@example.com", amount: 990, currency: "CNY", appid: "2021000000000001", status: "pending" };
const paidTrade = { code: "10000", tradeStatus: "TRADE_SUCCESS", outTradeNo: order.id, tradeNo: "2026092522001", totalAmount: "9.90" };

function request(body = {}) {
  return {
    method: "POST", headers: { origin: "https://shop.example", host: "shop.example", "x-forwarded-proto": "https" },
    body: { datasetId: dataset.id, provider: "alipay", clientType: "page", ...body }, query: {},
    session: { user: { email: order.email, isLoggedIn: true }, save: vi.fn() },
  };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function queryRequest() {
  return { method: "GET", headers: {}, query: { orderId: order.id }, session: { user: { email: order.email, isLoggedIn: true } } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example");
  vi.stubEnv("ALIPAY_APP_ID", order.appid);
  vi.stubEnv("ALIPAY_PRIVATE_KEY", "present");
  vi.stubEnv("ALIPAY_PUBLIC_KEY", "present");
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.db.getDatasets.mockResolvedValue([dataset]);
  mocks.db.getSiteSettings.mockResolvedValue({});
  mocks.db.getPurchasedIds.mockResolvedValue([]);
  mocks.db.getOrder.mockResolvedValue(order);
  mocks.db.updateUserPurchase.mockResolvedValue(true);
  mocks.sdk.pageExecute.mockReturnValue("https://openapi.alipay.com/gateway.do?charset=utf-8&sign=test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("alipay checkout", () => {
  it("records an Alipay order and returns the cashier URL", async () => {
    const res = response();
    await checkout(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ type: "alipay", payUrl: expect.stringContaining("https://openapi.alipay.com/"), outTradeNo: expect.any(String) });
    const saved = mocks.db.saveOrder.mock.calls[0][0];
    expect(saved).toMatchObject({ provider: "alipay", amount: 990, currency: "CNY", appid: order.appid, clientType: "page" });
    const [method, httpMethod, params] = mocks.sdk.pageExecute.mock.calls[0];
    expect([method, httpMethod]).toEqual(["alipay.trade.page.pay", "GET"]);
    expect(params.bizContent).toMatchObject({ out_trade_no: saved.id, total_amount: "9.90", product_code: "FAST_INSTANT_TRADE_PAY" });
    expect(params.bizContent.subject).not.toMatch(/[/=&]/);
    expect(params.notifyUrl).toBe("https://shop.example/api/notify/alipay");
    expect(new URL(params.returnUrl).searchParams.get("payOrder")).toBe(saved.id);
  });

  it("uses the mobile website product for wap", async () => {
    await checkout(request({ clientType: "wap" }), response());
    expect(mocks.sdk.pageExecute.mock.calls[0][0]).toBe("alipay.trade.wap.pay");
  });

  it("refuses a method the admin switched off and mismatched client types", async () => {
    mocks.db.getSiteSettings.mockResolvedValue({ enableAlipay: false });
    const off = response();
    await checkout(request(), off);
    expect(off.statusCode).toBe(403);

    mocks.db.getSiteSettings.mockResolvedValue({ enableWechatPay: false });
    const wechatOff = response();
    await checkout(request({ provider: "wechat", clientType: "native" }), wechatOff);
    expect(wechatOff.statusCode).toBe(403);

    const bad = response();
    await checkout(request({ clientType: "native" }), bad);
    expect(bad.statusCode).toBe(400);
    const unknown = response();
    await checkout(request({ provider: "paypal" }), unknown);
    expect(unknown.statusCode).toBe(400);
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });

  it("closes an unpaid previous Alipay order before creating a new one", async () => {
    mocks.sdk.exec.mockImplementation(async (method) => (method === "alipay.trade.query"
      ? { code: "10000", tradeStatus: "WAIT_BUYER_PAY", outTradeNo: order.id }
      : { code: "10000" }));
    const res = response();
    await checkout(request({ previousOrderId: order.id }), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.sdk.exec.mock.calls.map(([method]) => method)).toEqual(["alipay.trade.query", "alipay.trade.close"]);
    expect(mocks.sdk.exec.mock.calls[1][2]).toEqual({ validateSign: true });
  });

  it("grants access instead of charging again when the previous Alipay order was paid", async () => {
    mocks.sdk.exec.mockResolvedValue(paidTrade);
    const res = response();
    await checkout(request({ previousOrderId: order.id }), res);
    expect(res.statusCode).toBe(409);
    expect(mocks.db.updateUserPurchase).toHaveBeenCalledWith(order.email, dataset.id);
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });
});

describe("alipay order query", () => {
  it("grants access for a matching paid trade", async () => {
    mocks.sdk.exec.mockResolvedValue(paidTrade);
    const res = response();
    await checkOrder(queryRequest(), res);
    expect(res.body).toEqual({ paid: true });
    expect(mocks.db.markOrderPaid).toHaveBeenCalledWith(order.id, paidTrade.tradeNo);
  });

  it("refuses a paid trade whose amount differs", async () => {
    mocks.sdk.exec.mockResolvedValue({ ...paidTrade, totalAmount: "0.01" });
    const res = response();
    await checkOrder(queryRequest(), res);
    expect(res.statusCode).toBe(409);
    expect(mocks.db.updateUserPurchase).not.toHaveBeenCalled();
  });

  it("maps unpaid states for the payment panel", async () => {
    for (const [reply, state] of [
      [{ code: "10000", tradeStatus: "WAIT_BUYER_PAY" }, "NOTPAY"],
      [{ code: "40004", subCode: "ACQ.TRADE_NOT_EXIST" }, "NOTPAY"],
      [{ code: "10000", tradeStatus: "TRADE_CLOSED" }, "CLOSED"],
    ]) {
      mocks.sdk.exec.mockResolvedValue(reply);
      const res = response();
      await checkOrder(queryRequest(), res);
      expect(res.body).toEqual({ paid: false, state });
    }
  });

  it("reports provider errors without leaking them", async () => {
    mocks.sdk.exec.mockResolvedValue({ code: "40004", subCode: "ACQ.SYSTEM_ERROR", subMsg: "internal detail" });
    const res = response();
    await checkOrder(queryRequest(), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("internal detail");
  });
});
