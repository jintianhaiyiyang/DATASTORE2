import { describe, expect, it } from "vitest";
import {
  isOrderOwner,
  parsePaymentAttach,
  validatePaidOrder,
} from "../lib/orderValidation";

const order = {
  id: "ORDER_123",
  email: "buyer@example.com",
  amount: 990,
  currency: "CNY",
};
const payment = {
  out_trade_no: "ORDER_123",
  appid: "wx_app",
  mchid: "merchant",
  amount: { total: 990, currency: "CNY" },
};

describe("payment order validation", () => {
  it("requires exact ownership", () => {
    expect(isOrderOwner(order, " BUYER@example.com ")).toBe(true);
    expect(isOrderOwner(order, "attacker@example.com")).toBe(false);
  });

  it("rejects amount, attachment, merchant, and app mismatches", () => {
    const valid = {
      order,
      payment,
      attach: parsePaymentAttach('{"orderId":"ORDER_123"}'),
      expectedAppId: "wx_app",
      expectedMchId: "merchant",
    };
    expect(validatePaidOrder(valid)).toBe(true);
    expect(validatePaidOrder({ ...valid, payment: { ...payment, amount: { total: 1 } } })).toBe(false);
    expect(validatePaidOrder({ ...valid, attach: { orderId: "ORDER_other" } })).toBe(false);
    expect(validatePaidOrder({ ...valid, expectedMchId: "other" })).toBe(false);
  });

  it("handles malformed attachments without throwing", () => {
    expect(parsePaymentAttach("not-json")).toEqual({});
  });
});
