import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { getDatasets: vi.fn(), getPurchasedIds: vi.fn(), getOrder: vi.fn(), saveOrder: vi.fn(), updateUserPurchase: vi.fn(), markOrderPaid: vi.fn() },
  sdk: { transactions_h5: vi.fn(), transactions_jsapi: vi.fn(), transactions_native: vi.fn(), sign: vi.fn(), query: vi.fn(), close: vi.fn(), verifySign: vi.fn(), decipher_gcm: vi.fn() },
  createWxPay: vi.fn(), rate: vi.fn(),
}));
vi.mock("../lib/session", () => ({ withIronSessionApiRoute: (handler) => handler }));
vi.mock("../lib/db", () => mocks.db);
vi.mock("../lib/rateLimit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("../lib/wxpay", async (importOriginal) => ({ ...await importOriginal(), createWxPay: mocks.createWxPay }));

import checkout from "../pages/api/checkout";
import checkOrder from "../pages/api/check-order";
import notify from "../pages/api/notify/wechat";
import oauthStart from "../pages/api/wechat/oauth/start";
import oauthCallback from "../pages/api/wechat/oauth/callback";

const dataset = { id: "resource1", name: "全国人口数据".repeat(20), price: 9.9 };
const order = { id: "ORDER_existing123", datasetId: "resource1", email: "buyer@example.com", amount: 990, currency: "CNY", appid: "wx_app", mchid: "merchant", status: "pending" };
const paid = { out_trade_no: order.id, attach: JSON.stringify({ orderId: order.id }), amount: { total: 990, currency: "CNY" }, appid: "wx_app", mchid: "merchant", trade_state: "SUCCESS", transaction_id: "tx123" };
const params = { appId: "wx_app", timeStamp: "1720000000", nonceStr: "nonce", package: "prepay_id=wx_order", signType: "RSA", paySign: "signature" };

function request() {
  return {
    method: "POST", headers: { origin: "https://shop.example", host: "shop.example", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.8" },
    body: { datasetId: dataset.id, clientType: "native" }, query: {},
    session: { user: { email: order.email, isLoggedIn: true }, wechatOpenId: "openid", wechatAppId: "wx_app", save: vi.fn() },
  };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, redirect(url) { this.statusCode = 302; this.location = url; return this; } };
}
function notificationRequest() {
  const req = Readable.from([Buffer.from(JSON.stringify({ resource: { ciphertext: "test", nonce: "nonce" } }))]);
  req.method = "POST";
  req.headers = { "wechatpay-timestamp": "1720000000", "wechatpay-nonce": "nonce", "wechatpay-signature": "test-signature", "wechatpay-serial": "serial" };
  return req;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example");
  vi.stubEnv("WX_APP_ID", "wx_app");
  vi.stubEnv("WX_APP_SECRET", "test-only");
  vi.stubEnv("WX_MCH_ID", "merchant");
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.createWxPay.mockReturnValue(mocks.sdk);
  mocks.db.getDatasets.mockResolvedValue([dataset]);
  mocks.db.getPurchasedIds.mockResolvedValue([]);
  mocks.db.getOrder.mockResolvedValue(order);
  mocks.db.updateUserPurchase.mockResolvedValue(true);
  mocks.sdk.transactions_native.mockResolvedValue({ status: 200, data: { code_url: "weixin://wxpay/bizpayurl?pr=test" } });
  mocks.sdk.transactions_jsapi.mockResolvedValue({ status: 200, data: params });
  mocks.sdk.transactions_h5.mockResolvedValue({ status: 200, data: { h5_url: "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test" } });
  mocks.sdk.query.mockResolvedValue({ status: 200, data: paid });
  mocks.sdk.close.mockResolvedValue({ status: 204 });
  mocks.sdk.verifySign.mockResolvedValue(true);
  mocks.sdk.decipher_gcm.mockReturnValue(paid);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("checkout API channel regressions", () => {
  it("returns the API v3 h5_url to mobile clients", async () => {
    const req = request(); req.body.clientType = "h5";
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ type: "h5", mwebUrl: expect.stringContaining("https://wx.tenpay.com/") });
    const sent = mocks.sdk.transactions_h5.mock.calls[0][0];
    expect(sent.amount).toEqual({ total: 990, currency: "CNY" });
    expect(Buffer.byteLength(sent.description)).toBeLessThanOrEqual(127);
    expect(sent.scene_info.payer_client_ip).toBe("203.0.113.8");
    expect(sent.out_trade_no).toHaveLength(32);
    expect(mocks.db.saveOrder.mock.invocationCallOrder[0]).toBeLessThan(mocks.sdk.transactions_h5.mock.invocationCallOrder[0]);
  });
  it("also accepts a flat H5 SDK response", async () => {
    mocks.sdk.transactions_h5.mockResolvedValue({ status: 200, h5_url: "https://wx.tenpay.com/pay" });
    const req = request(); req.body.clientType = "h5";
    const res = response(); await checkout(req, res);
    expect(res.body.mwebUrl).toBe("https://wx.tenpay.com/pay");
  });
  it("returns the SDK's already-signed JSAPI parameters", async () => {
    const req = request(); req.body.clientType = "jsapi";
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.payParams).toEqual(params);
    expect(mocks.sdk.sign).not.toHaveBeenCalled();
  });
  it("supports Native QR on a mobile device without OAuth configuration", async () => {
    vi.stubEnv("WX_APP_SECRET", "");
    const req = request(); req.headers["user-agent"] = "iPhone MicroMessenger";
    const res = response(); await checkout(req, res);
    expect(res.body.type).toBe("qrcode");
    expect(res.body.codeUrl).toContain("weixin://");
  });
  it("offers a QR alternative when H5 is not activated instead of making another order automatically", async () => {
    mocks.sdk.transactions_h5.mockResolvedValue({ status: 403, error: '{"code":"NO_AUTH","message":"not activated"}' });
    const req = request(); req.body.clientType = "h5";
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.fallbackType).toBe("native");
    expect(mocks.sdk.transactions_native).not.toHaveBeenCalled();
  });
  it("requests OAuth before saving an order if openid belongs to another app", async () => {
    const req = request(); req.body.clientType = "jsapi"; req.session.wechatAppId = "old_app";
    const res = response(); await checkout(req, res);
    expect(res.body.needOauth).toBe(true);
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, cross-origin and sub-cent checkout requests", async () => {
    const req = request(); req.session.user = null;
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(401);
    const foreign = request(); foreign.headers.origin = "https://evil.example";
    const blocked = response(); await checkout(foreign, blocked);
    expect(blocked.statusCode).toBe(403);
    mocks.db.getDatasets.mockResolvedValue([{ ...dataset, price: 0.001 }]);
    const invalid = response(); await checkout(request(), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });
  it("closes the old unpaid order before switching payment methods", async () => {
    mocks.sdk.query.mockResolvedValue({ status: 200, data: { trade_state: "NOTPAY" } });
    const req = request(); req.body.previousOrderId = order.id;
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(200);
    expect(mocks.sdk.close).toHaveBeenCalledWith(order.id);
    expect(mocks.sdk.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.saveOrder.mock.invocationCallOrder[0]);
  });
  it("does not create another order if the previous one was paid", async () => {
    const req = request(); req.body.previousOrderId = order.id;
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(409);
    expect(mocks.db.updateUserPurchase).toHaveBeenCalledWith(order.email, dataset.id);
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });
  it("does not switch methods while payment is in progress or closing fails", async () => {
    const req = request(); req.body.previousOrderId = order.id;
    mocks.sdk.query.mockResolvedValue({ status: 200, data: { trade_state: "USERPAYING" } });
    const res = response(); await checkout(req, res);
    expect(res.statusCode).toBe(425);
    mocks.sdk.query.mockResolvedValue({ status: 200, data: { trade_state: "NOTPAY" } });
    mocks.sdk.close.mockResolvedValue({ status: 400, code: "ORDERPAID" });
    await checkout(req, response());
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });
});

describe("payment confirmation and access", () => {
  it("grants access only after matching the user's paid order", async () => {
    const req = request(); req.method = "GET"; req.query.orderId = order.id;
    const res = response(); await checkOrder(req, res);
    expect(res.body.paid).toBe(true);
    expect(mocks.db.updateUserPurchase).toHaveBeenCalledWith(order.email, order.datasetId);
    expect(mocks.db.updateUserPurchase.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.markOrderPaid.mock.invocationCallOrder[0]);
  });
  it("does not disclose another user's order", async () => {
    const req = request(); req.method = "GET"; req.query.orderId = order.id; req.session.user.email = "other@example.com";
    const res = response(); await checkOrder(req, res);
    expect(res.statusCode).toBe(404);
    expect(mocks.sdk.query).not.toHaveBeenCalled();
  });
  it.each([
    { appid: "wrong_app" }, { mchid: "wrong_merchant" },
    { amount: { total: 1, currency: "CNY" } }, { amount: { total: 990 } },
  ])("rejects mismatched provider data: %j", async (patch) => {
    mocks.sdk.query.mockResolvedValue({ status: 200, data: { ...paid, ...patch } });
    const req = request(); req.method = "GET"; req.query.orderId = order.id;
    const res = response(); await checkOrder(req, res);
    expect(res.statusCode).toBe(409);
    expect(mocks.db.updateUserPurchase).not.toHaveBeenCalled();
  });
  it("does not report success when access could not be saved", async () => {
    mocks.db.updateUserPurchase.mockResolvedValue(false);
    const req = request(); req.method = "GET"; req.query.orderId = order.id;
    const res = response(); await checkOrder(req, res);
    expect(res.statusCode).toBe(500);
    const notification = response(); await notify(notificationRequest(), notification);
    expect(notification.statusCode).toBe(500);
    expect(mocks.db.markOrderPaid).not.toHaveBeenCalled();
  });
  it("requires a valid raw-body signature on payment notifications", async () => {
    mocks.sdk.verifySign.mockResolvedValue(false);
    const res = response(); await notify(notificationRequest(), res);
    expect(res.statusCode).toBe(401);
    expect(mocks.sdk.decipher_gcm).not.toHaveBeenCalled();
    expect(mocks.db.updateUserPurchase).not.toHaveBeenCalled();
  });
  it("accepts a verified notification and ignores repeat delivery after fulfillment", async () => {
    const res = response(); await notify(notificationRequest(), res);
    expect(res.body.code).toBe("SUCCESS");
    expect(mocks.sdk.verifySign.mock.calls[0][0].body).toBe(JSON.stringify({ resource: { ciphertext: "test", nonce: "nonce" } }));
    mocks.db.getOrder.mockResolvedValue({ ...order, status: "paid" });
    await notify(notificationRequest(), response());
    expect(mocks.db.updateUserPurchase).toHaveBeenCalledTimes(1);
  });
});

describe("WeChat OAuth round trip", () => {
  it("binds a one-time expiring state and returns to the resource", async () => {
    const req = request(); req.method = "GET"; req.query.redirect = "https://shop.example/dataset/resource1";
    const start = response(); await oauthStart(req, start);
    expect(new URL(start.location).hostname).toBe("open.weixin.qq.com");
    expect(req.session.wxOAuthExpires).toBeGreaterThan(Date.now());
    req.query = { code: "authorization-code", state: req.session.wxOAuthState };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ openid: "openid_new" }) })));
    const end = response(); await oauthCallback(req, end);
    expect(end.location).toBe("https://shop.example/dataset/resource1?wechatPay=ready");
    expect(req.session.wechatAppId).toBe("wx_app");
    expect(req.session.wechatOpenId).toBe("openid_new");
    expect(req.session.wxOAuthState).toBeUndefined();
    expect(req.session.wxOAuthExpires).toBeUndefined();
    const replay = response(); await oauthCallback(req, replay);
    expect(replay.statusCode).toBe(400);
  });
  it("returns to the QR alternative if the OAuth token request fails", async () => {
    const req = request(); req.method = "GET";
    Object.assign(req.session, { wxOAuthState: "state123", wxOAuthExpires: Date.now() + 60000, wxOAuthRedirect: "/dataset/resource1" });
    req.query = { code: "code", state: "state123" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ errcode: 40029 }) })));
    const res = response(); await oauthCallback(req, res);
    expect(res.location).toBe("https://shop.example/dataset/resource1?wechatPay=failed");
    expect(req.session.wxOAuthState).toBeUndefined();
  });
});
