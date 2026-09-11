import { describe, expect, it, vi } from "vitest";
import WxPay from "wechatpay-node-v3";
import { getJsapiPayParams, truncateUtf8, unwrapWxResult } from "../lib/wxpay";

describe("WeChat Pay response handling", () => {
  it("unwraps successful SDK responses", () => {
    expect(
      unwrapWxResult({ status: 200, data: { code_url: "weixin://wxpay/example" } })
    ).toEqual({ code_url: "weixin://wxpay/example" });
  });

  it("preserves safe provider diagnostics on failed responses", () => {
    expect.assertions(4);
    try {
      unwrapWxResult({
        status: 400,
        error: JSON.stringify({ code: "PARAM_ERROR", message: "商户订单号格式错误" }),
      });
    } catch (error) {
      expect(error.name).toBe("WxPayError");
      expect(error.status).toBe(400);
      expect(error.code).toBe("PARAM_ERROR");
      expect(error.providerMessage).toBe("商户订单号格式错误");
    }
  });

  it("accepts the actual installed SDK's signed JSAPI response", async () => {
    const client = Object.assign(Object.create(WxPay.prototype), {
      appid: "wx_app", mchid: "merchant", sign: vi.fn(() => "signature"),
      buildAuthorization: vi.fn(), getHeaders: vi.fn(),
      httpService: { post: vi.fn(async () => ({ status: 200, data: { prepay_id: "wx_test123" } })) },
    });
    const result = await client.transactions_jsapi({ payer: { openid: "buyer" } });
    const params = getJsapiPayParams(unwrapWxResult(result), client, "wx_app");
    expect(params).toMatchObject({ appId: "wx_app", package: "prepay_id=wx_test123", signType: "RSA", paySign: "signature" });
    expect(client.sign).toHaveBeenCalledTimes(1);
  });

  it("signs raw prepay responses with the required newline-delimited payload", () => {
    const sign = vi.fn(() => "signature");
    const params = getJsapiPayParams({ prepay_id: "wx_test123" }, { sign }, "wx_app");
    expect(sign).toHaveBeenCalledWith(`wx_app\n${params.timeStamp}\n${params.nonceStr}\nprepay_id=wx_test123\n`);
    expect(() => getJsapiPayParams({}, { sign }, "wx_app")).toThrow();
  });

  it("rejects SDK network errors and reports top-level provider codes", () => {
    expect(() => unwrapWxResult({ errRaw: { code: "ECONNRESET" } })).toThrow();
    expect(() => unwrapWxResult({ status: 403, code: "NO_AUTH", message: "未开通" })).toThrow();
    expect(unwrapWxResult({ status: 204 })).toEqual({ status: 204 });
  });

  it("bounds Chinese descriptions by UTF-8 bytes without splitting characters", () => {
    const result = truncateUtf8("购买：" + "全国人口数据📊".repeat(20), 127);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(127);
    expect(result).not.toContain("�");
    expect(result.length).toBeGreaterThan(10);
  });
});
