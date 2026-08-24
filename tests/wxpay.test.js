import { describe, expect, it } from "vitest";
import { unwrapWxResult } from "../lib/wxpay";

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
});
