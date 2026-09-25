import crypto from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ getOrder: vi.fn(), updateUserPurchase: vi.fn(), markOrderPaid: vi.fn() }));
vi.mock("../lib/db", () => db);

import notify from "../pages/api/notify/alipay";
import { createAlipay, createAlipayPayUrl, detectPrivateKeyType, yuanToCents } from "../lib/alipay";
import { validatePaidOrder } from "../lib/orderValidation";

const pair = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const app = pair();
const gateway = pair(); // stands in for Alipay's own signing key
const pem = (key, type, format = "pem") => key.export({ type, format });

const order = { id: "ORDER_alipay0001", provider: "alipay", datasetId: "resource1", email: "buyer@example.com", amount: 990, currency: "CNY", appid: "2021000000000001", status: "pending" };

// Alipay signs the sorted, decoded parameters except sign/sign_type.
function signed(params, key = gateway.privateKey) {
  const content = Object.keys(params).filter((k) => k !== "sign" && k !== "sign_type").sort().map((k) => `${k}=${params[k]}`).join("&");
  return { ...params, sign_type: "RSA2", sign: crypto.sign("RSA-SHA256", Buffer.from(content), key).toString("base64") };
}
function paidNotice(overrides = {}) {
  return {
    app_id: order.appid, out_trade_no: order.id, trade_no: "2026092522001", trade_status: "TRADE_SUCCESS",
    total_amount: "9.90", seller_id: "2088000000000001", subject: "购买: 100% 城市 数据+统计", gmt_payment: "2026-09-25 12:00:00",
    ...overrides,
  };
}
function post(params) {
  const req = Readable.from([Buffer.from(new URLSearchParams(params).toString())]);
  req.method = "POST";
  req.headers = { "content-type": "application/x-www-form-urlencoded; charset=utf-8" };
  return req;
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ALIPAY_APP_ID", order.appid);
  // One-line env values with escaped newlines must work.
  vi.stubEnv("ALIPAY_PRIVATE_KEY", pem(app.privateKey, "pkcs8").replace(/\n/g, "\\n"));
  vi.stubEnv("ALIPAY_PUBLIC_KEY", pem(gateway.publicKey, "spki"));
  vi.stubEnv("ALIPAY_SELLER_ID", "");
  db.getOrder.mockResolvedValue(order);
  db.updateUserPurchase.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("alipay configuration", () => {
  it("detects PKCS1 and PKCS8 private keys", () => {
    expect(detectPrivateKeyType(pem(app.privateKey, "pkcs8"))).toBe("PKCS8");
    expect(detectPrivateKeyType(pem(app.privateKey, "pkcs1"))).toBe("PKCS1");
    expect(detectPrivateKeyType(pem(app.privateKey, "pkcs1", "der").toString("base64"))).toBe("PKCS1");
    expect(detectPrivateKeyType("not-a-key")).toBeNull();
  });

  it("only talks to official gateways", () => {
    vi.stubEnv("ALIPAY_GATEWAY", "https://openapi.alipay.com.evil.test/gateway.do");
    expect(() => createAlipay()).toThrow("ALIPAY_GATEWAY");
    vi.stubEnv("ALIPAY_GATEWAY", "https://openapi-sandbox.dl.alipaydev.com/gateway.do");
    expect(() => createAlipay()).not.toThrow();
  });

  it("builds a signed cashier URL with the server-side amount", () => {
    const url = new URL(createAlipayPayUrl(createAlipay(), {
      type: "wap", orderId: order.id, amount: 990, subject: "购买: 数据",
      notifyUrl: "https://shop.example/api/notify/alipay", returnUrl: "https://shop.example/dataset/resource1?payOrder=ORDER_alipay0001",
    }));
    expect(url.hostname).toBe("openapi.alipay.com");
    expect(url.searchParams.get("method")).toBe("alipay.trade.wap.pay");
    expect(url.searchParams.get("sign")).toBeTruthy();
    expect(url.searchParams.get("notify_url")).toBe("https://shop.example/api/notify/alipay");
    expect(JSON.parse(url.searchParams.get("biz_content"))).toMatchObject({
      out_trade_no: order.id, total_amount: "9.90", product_code: "QUICK_WAP_WAY", timeout_express: "30m",
      quit_url: "https://shop.example/dataset/resource1?payOrder=ORDER_alipay0001",
    });
  });

  it("parses amounts strictly", () => {
    expect(yuanToCents("9.90")).toBe(990);
    expect(yuanToCents("10")).toBe(1000);
    expect(yuanToCents("9.901")).toBeNaN();
    expect(yuanToCents("-1")).toBeNaN();
  });
});

describe("alipay notification", () => {
  it("grants the purchase for a correctly signed payment", async () => {
    const res = response();
    await notify(post(signed(paidNotice())), res);
    expect(res.body).toBe("success");
    expect(db.updateUserPurchase).toHaveBeenCalledWith(order.email, order.datasetId);
    expect(db.markOrderPaid).toHaveBeenCalledWith(order.id, "2026092522001");
  });

  it("rejects forged or tampered notifications", async () => {
    const forged = response();
    await notify(post(signed(paidNotice(), app.privateKey)), forged);
    expect(forged.statusCode).toBe(401);

    const tampered = response();
    await notify(post({ ...signed(paidNotice()), total_amount: "0.01" }), tampered);
    expect(tampered.statusCode).toBe(401);
    expect(db.updateUserPurchase).not.toHaveBeenCalled();
  });

  it("rejects signed notifications that do not match the local order", async () => {
    for (const overrides of [{ total_amount: "0.99" }, { app_id: "2021999999999999" }, { out_trade_no: "ORDER_other" }]) {
      const res = response();
      await notify(post(signed(paidNotice(overrides))), res);
      expect(res.body).toBe("fail");
    }
    db.getOrder.mockResolvedValue({ ...order, provider: "wechat" });
    const wrongProvider = response();
    await notify(post(signed(paidNotice())), wrongProvider);
    expect(wrongProvider.body).toBe("fail");
    expect(db.updateUserPurchase).not.toHaveBeenCalled();
  });

  it("checks the seller when ALIPAY_SELLER_ID is set", async () => {
    vi.stubEnv("ALIPAY_SELLER_ID", "2088000000000002");
    const res = response();
    await notify(post(signed(paidNotice())), res);
    expect(res.body).toBe("fail");
  });

  it("acknowledges unpaid state changes without granting access", async () => {
    const res = response();
    await notify(post(signed(paidNotice({ trade_status: "WAIT_BUYER_PAY" }))), res);
    expect(res.body).toBe("success");
    expect(db.updateUserPurchase).not.toHaveBeenCalled();
  });

  it("never accepts an Alipay order as a WeChat payment", () => {
    expect(validatePaidOrder({ order, payment: { trade_state: "SUCCESS" } })).toBe(false);
  });
});
