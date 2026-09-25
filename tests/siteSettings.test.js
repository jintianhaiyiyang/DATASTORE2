import { describe, expect, it } from "vitest";
import { isSafeAnnouncementLink, parseSiteSettingsUpdate } from "../lib/siteSettings";
import { withPaymentAvailability } from "../lib/paymentConfig";

describe("site settings updates", () => {
  it("accepts partial updates without touching other fields", () => {
    expect(parseSiteSettingsUpdate({ enableAlipay: false })).toEqual({ settings: { enableAlipay: false } });
    expect(parseSiteSettingsUpdate({ announcementEnabled: true, announcementText: " <b>国庆</b> 八折 ", announcementTone: "warning" }))
      .toEqual({ settings: { announcementEnabled: true, announcementText: "国庆 八折", announcementTone: "warning" } });
  });

  it("rejects invalid values", () => {
    expect(parseSiteSettingsUpdate({ enableWechatPay: "false" }).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({ announcementTone: "red" }).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({ announcementText: "字".repeat(301) }).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({ announcementEnabled: true, announcementText: "" }).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({ siteTitle: "" }).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({}).error).toBeTruthy();
    expect(parseSiteSettingsUpdate({ payments: { wechat: true } }).error).toBeTruthy();
  });

  it("only allows site paths or HTTPS announcement links", () => {
    for (const ok of ["", "/dataset/abc?x=1#y", "https://example.com/sale"]) expect(isSafeAnnouncementLink(ok)).toBe(true);
    for (const bad of ["//evil.test", "/\\evil.test", "javascript:alert(1)", "http://example.com", "dataset/1", "/a b"]) {
      expect(isSafeAnnouncementLink(bad)).toBe(false);
    }
  });

  it("shows a payment method only when enabled and configured", () => {
    const env = { ALIPAY_APP_ID: "a", ALIPAY_PRIVATE_KEY: "k", ALIPAY_PUBLIC_KEY: "p" };
    expect(withPaymentAvailability({}, env).payments).toEqual({ wechat: false, alipay: true });
    expect(withPaymentAvailability({ enableAlipay: false }, env).payments).toEqual({ wechat: false, alipay: false });
  });
});
