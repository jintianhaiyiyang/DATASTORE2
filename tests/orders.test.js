import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { getDatasets: vi.fn(), getPurchasedIds: vi.fn() },
  listUserOrders: vi.fn(),
  getDeliveries: vi.fn(),
}));
vi.mock("@vercel/kv", () => ({ kv: {} }));
vi.mock("../lib/session", () => ({ withIronSessionApiRoute: (handler) => handler }));
vi.mock("../lib/db", () => mocks.db);
vi.mock("../lib/rateLimit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("../lib/orders", async (importOriginal) => ({ ...await importOriginal(), listUserOrders: mocks.listUserOrders }));
vi.mock("../lib/digital", async (importOriginal) => ({ ...await importOriginal(), getDeliveries: mocks.getDeliveries }));

import myOrders from "../pages/api/my/orders";
import { amountText, summarizeOrders } from "../lib/orders";

const NOW = Date.parse("2026-11-18T10:00:00+08:00");
const usdtAtomic = "10000123000000000000"; // 10.000123 USDT

describe("order amounts and stats", () => {
  it("formats CNY cents and USDT atomic amounts", () => {
    expect(amountText({ provider: "alipay", amount: 990 })).toBe("¥9.90");
    expect(amountText({ amount: 100 })).toBe("¥1.00");
    expect(amountText({ provider: "usdt", actualAtomic: usdtAtomic })).toBe("10.000123 USDT");
  });

  it("totals today, this month and USDT separately in China time", () => {
    const stats = summarizeOrders([
      { provider: "wechat", amount: 1000, paidAt: "2026-11-18T01:00:00+08:00" },
      { provider: "alipay", amount: 500, paidAt: "2026-11-17T23:30:00+08:00" },
      { provider: "alipay", amount: 200, paidAt: "2026-10-31T23:59:00+08:00" },
      { provider: "usdt", actualAtomic: usdtAtomic, cnyPrice: "70", paidAt: "2026-11-18T09:00:00+08:00" },
    ], NOW);
    expect(stats).toMatchObject({ count: 4, cnyCents: 1700, todayCount: 2, todayCnyCents: 1000,
      monthCount: 3, monthCnyCents: 1500, usdt: "10.000123" });
  });
});

function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const request = (user) => ({ method: "GET", query: {}, headers: {}, session: { user } });

describe("my orders API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.db.getDatasets.mockResolvedValue([
      { id: "ds", name: "Dataset", price: 9, category: "dataset", baiduLink: "https://pan.example/ds" },
      { id: "acc", name: "Account", price: 5, category: "digital", deliveryMode: "stock" },
      { id: "other", name: "Not mine", price: 1, category: "digital", deliveryMode: "fixed", deliveryContent: "secret" },
    ]);
    mocks.db.getPurchasedIds.mockResolvedValue(["ds", "acc", "legacy-gone"]);
    mocks.listUserOrders.mockResolvedValue([
      { id: "ORDER_2", provider: "alipay", datasetId: "acc", amount: 500, paidAt: "2026-11-18T02:00:00Z" },
      { id: "ORDER_1", provider: "wechat", datasetId: "ds", amount: 900, paidAt: "2026-11-17T02:00:00Z" },
    ]);
    mocks.getDeliveries.mockResolvedValue([{ orderId: "ORDER_2", item: "user----pass", pending: false }]);
  });

  it("requires login", async () => {
    const res = response();
    await myOrders(request(null), res);
    expect(res.statusCode).toBe(401);
  });

  it("lists only the buyer's purchases with their content, newest first", async () => {
    const res = response();
    await myOrders(request({ isLoggedIn: true, email: "buyer@example.com" }), res);
    expect(res.statusCode).toBe(200);
    const { items } = res.body;
    expect(items.map((i) => i.datasetId)).toEqual(["acc", "ds", "legacy-gone"]);
    expect(items[0]).toMatchObject({ available: true, deliveries: [{ item: "user----pass" }], orders: [{ amount: "¥5.00", provider: "支付宝" }] });
    expect(items[1]).toMatchObject({ downloadUrl: "https://pan.example/ds" });
    expect(items[2]).toMatchObject({ available: false, name: "已下架的商品" });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(mocks.getDeliveries).toHaveBeenCalledWith("buyer@example.com", "acc");
  });
});
