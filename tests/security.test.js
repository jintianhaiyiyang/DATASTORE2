import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  isSameOriginRequest,
  normalizeEmail,
  paymentOrderId,
  resolveSameOriginRedirect,
} from "../lib/security";

function request(headers = {}) {
  return { headers, socket: { encrypted: true } };
}

describe("security helpers", () => {
  it("normalizes email and compares secrets safely", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });

  it("accepts the exact request origin and rejects cross-site requests", () => {
    expect(
      isSameOriginRequest(
        request({ host: "store.example", origin: "https://store.example" })
      )
    ).toBe(true);
    expect(
      isSameOriginRequest(
        request({ host: "store.example", origin: "https://store.example.evil.test" })
      )
    ).toBe(false);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("prevents prefix-based OAuth open redirects", () => {
    expect(
      resolveSameOriginRedirect("https://store.example/dataset/1", "https://store.example")
    ).toBe("https://store.example/dataset/1");
    expect(
      resolveSameOriginRedirect("https://store.example.evil.test/phish", "https://store.example")
    ).toBe("https://store.example/");
  });

  it("creates WeChat-compatible unique merchant order numbers", () => {
    const ids = new Set(Array.from({ length: 100 }, () => paymentOrderId()));
    expect(ids.size).toBe(100);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_*-]{6,32}$/);
      expect(id).toHaveLength(32);
    }
  });
});
