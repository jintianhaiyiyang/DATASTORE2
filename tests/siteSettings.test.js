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
    expect(withPaymentAvailability({}, env).payments).toEqual({ wechat: false, alipay: true, usdt: false });
    expect(withPaymentAvailability({ enableAlipay: false }, env).payments).toEqual({ wechat: false, alipay: false, usdt: false });
  });
});

describe("announcement list", () => {
  it("keeps one item per line and splits inline numbering", async () => {
    const { splitAnnouncement } = await import("../lib/announcement");
    expect(parseSiteSettingsUpdate({ announcementText: " 1. 第一条 \r\n\r\n 2、<b>第二</b>条 " }).settings.announcementText)
      .toBe("1. 第一条\n2、第二条");
    expect(splitAnnouncement("1. 第一条\n2、第二条")).toEqual(["第一条", "第二条"]);
    expect(splitAnnouncement("1 先保存卡密！ 2 有问题找客服。 24小时内回复 3 售出不退")).toEqual(["先保存卡密！", "有问题找客服。 24小时内回复", "售出不退"]);
    expect(splitAnnouncement("国庆 8 折，10 月 7 日截止")).toEqual(["国庆 8 折，10 月 7 日截止"]);
    expect(splitAnnouncement("活动 1 月 2 日开始")).toEqual(["活动 1 月 2 日开始"]);
  });
});
