import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { getDatasets: vi.fn(), getSiteSettings: vi.fn(), getPurchasedIds: vi.fn(), getOrder: vi.fn(), saveOrder: vi.fn() },
  kv: { llen: vi.fn() },
  sdk: { exec: vi.fn(), pageExecute: vi.fn() },
}));
vi.mock("@vercel/kv", () => ({ kv: mocks.kv }));
vi.mock("../lib/session", () => ({ withIronSessionApiRoute: (handler) => handler }));
vi.mock("../lib/fulfillOrder", () => ({ fulfillOrder: vi.fn() }));
vi.mock("../lib/db", () => mocks.db);
vi.mock("../lib/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("../lib/alipay", async (importOriginal) => ({ ...await importOriginal(), createAlipay: () => mocks.sdk }));

import checkout from "../pages/api/checkout";
import { sanitizeDataset } from "../lib/content";
import { parseDigitalFields, parseStockItems, presentDataset } from "../lib/digital";

const fixed = sanitizeDataset({ id: "d1", name: "File", price: 9, category: "digital", deliveryMode: "fixed",
  deliveryContent: "链接 https://pan.example/s/1\r\n提取码 ab\u0007cd", baiduLink: "https://pan.example/s/1" });
const stock = sanitizeDataset({ id: "d2", name: "Account", price: 5, category: "digital", deliveryMode: "stock" });

describe("digital goods records", () => {
  it("normalises category and keeps plain-text line breaks", () => {
    expect(fixed.deliveryContent).toBe("链接 https://pan.example/s/1\n提取码 abcd");
    expect(sanitizeDataset({ id: "x", name: "D" }).category).toBe("dataset");
    expect(sanitizeDataset({ id: "x", name: "D", deliveryContent: "secret" })).not.toHaveProperty("deliveryContent");
  });

  it("hides fixed content and links until purchase", () => {
    const anonymous = presentDataset(fixed, {});
    expect(anonymous).not.toHaveProperty("deliveryContent");
    expect(anonymous.downloadUrl).toBeNull();
    expect(anonymous.isPaid).toBe(false);
    const buyer = presentDataset(fixed, { purchased: true });
    expect(buyer.deliveryContent).toContain("提取码");
    expect(buyer.downloadUrl).toBe("https://pan.example/s/1");
  });

  it("never exposes other buyers' stock and keeps stock products re-purchasable", () => {
    const view = presentDataset(stock, { purchased: true, stockCount: 3, deliveries: [{ orderId: "o", item: "acc" }] });
    expect(view).toMatchObject({ stockCount: 3, isPaid: true, downloadUrl: null, deliveries: [{ item: "acc" }] });
    expect(presentDataset(stock, { stockCount: 0 })).not.toHaveProperty("deliveries");
  });

  it("validates admin input", () => {
    expect(parseDigitalFields({ category: "digital", deliveryMode: "stock", price: 0 }).error).toMatch("大于 0");
    expect(parseDigitalFields({ category: "digital", deliveryMode: "fixed", price: 1 }).error).toMatch("发货内容");
    expect(parseDigitalFields({ category: "digital", deliveryMode: "fixed", price: 1, deliveryContent: "x" }).patch)
      .toEqual({ category: "digital", deliveryMode: "fixed", deliveryContent: "x" });
    expect(parseDigitalFields({ category: "other" }).error).toBeTruthy();
    expect(parseDigitalFields({ price: 0 }, stock).error).toMatch("大于 0");
    expect(parseStockItems("a\r\n\n  b  \n").items).toEqual(["a", "b"]);
    expect(parseStockItems(" \n ").error).toBeTruthy();
    expect(parseStockItems("x".repeat(2001)).error).toBeTruthy();
  });
});

function request(datasetId, body = {}) {
  return {
    method: "POST", headers: { origin: "https://shop.example", host: "shop.example", "x-forwarded-proto": "https" },
    body: { datasetId, provider: "alipay", clientType: "page", ...body }, query: {},
    session: { user: { email: "buyer@example.com", isLoggedIn: true }, save: vi.fn() },
  };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

describe("digital goods checkout", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example");
    vi.stubEnv("ALIPAY_APP_ID", "2021000000000001");
    vi.stubEnv("ALIPAY_PRIVATE_KEY", "present");
    vi.stubEnv("ALIPAY_PUBLIC_KEY", "present");
    mocks.db.getDatasets.mockResolvedValue([fixed, stock]);
    mocks.db.getSiteSettings.mockResolvedValue({ enableAlipay: true });
    mocks.db.getPurchasedIds.mockResolvedValue(["d1", "d2"]);
    mocks.db.saveOrder.mockResolvedValue({});
    mocks.sdk.pageExecute.mockReturnValue("https://openapi.alipay.com/gateway.do?sign=test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.restoreAllMocks(); });

  it("lets a buyer purchase a stock product again while stock remains", async () => {
    mocks.kv.llen.mockResolvedValue(2);
    const res = response();
    await checkout(request("d2"), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.db.saveOrder.mock.calls[0][0]).toMatchObject({ datasetId: "d2", amount: 500 });
  });

  it("refuses a sold-out stock product before creating an order", async () => {
    mocks.kv.llen.mockResolvedValue(0);
    const res = response();
    await checkout(request("d2"), res);
    expect(res.statusCode).toBe(410);
    expect(res.body.code).toBe("SOLD_OUT");
    expect(mocks.db.saveOrder).not.toHaveBeenCalled();
  });

  it("keeps fixed-content products one-time purchases", async () => {
    const res = response();
    await checkout(request("d1"), res);
    expect(res.statusCode).toBe(409);
  });
});
