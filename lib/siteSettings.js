import { cleanText, isHttpUrl, isSafeLogoUrl, sanitizeRichText } from "./content";
import { ANNOUNCEMENT_MAX_LENGTH } from "./siteDefaults";

const BOOLEAN_KEYS = ["announcementEnabled", "enableWechatPay", "enableAlipay"];
const TONES = ["info", "warning"];

// An announcement may link to a site path or an external HTTPS page.
// Backslashes are rejected because browsers read "/\\host" as "//host".
export function isSafeAnnouncementLink(value) {
  if (!value) return true;
  if (isHttpUrl(value)) return true;
  if (!/^\/(?![/\\])/.test(value) || /[\s\\]/.test(value)) return false;
  try {
    return new URL(value, "https://site.invalid").origin === "https://site.invalid";
  } catch {
    return false;
  }
}

function fail(message) {
  return { error: message };
}

/**
 * Validate an admin settings update. Only keys present in the body are
 * returned, so each admin tab can save its own fields without resetting others.
 */
export function parseSiteSettingsUpdate(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;
  const text = (key) => (typeof input[key] === "string" ? input[key].trim() : "");
  const settings = {};

  if (has("siteTitle")) {
    const value = text("siteTitle");
    if (!value) return fail("站点标题不能为空");
    if (value.length > 60) return fail("站点标题不能超过 60 个字");
    settings.siteTitle = value;
  }
  if (has("pageTitle")) {
    const value = text("pageTitle");
    if (value.length > 120) return fail("标签页标题不能超过 120 个字");
    settings.pageTitle = value;
  }
  if (has("footerText")) {
    const value = text("footerText");
    if (value.length > 200) return fail("页脚文案不能超过 200 个字");
    settings.footerText = value;
  }
  if (has("logoUrl")) {
    const value = text("logoUrl");
    if (value.length > 400000) return fail("Logo 图片过大");
    if (!isSafeLogoUrl(value)) return fail("Logo 必须是 HTTPS 地址或常见图片 Data URL");
    settings.logoUrl = value;
  }
  if (has("aboutContent")) {
    const value = typeof input.aboutContent === "string" ? sanitizeRichText(input.aboutContent) : "";
    if (value.length > 5000) return fail("“关于我们”内容过长");
    settings.aboutContent = value;
  }
  if (has("announcementText")) {
    const value = cleanText(input.announcementText, ANNOUNCEMENT_MAX_LENGTH + 1);
    if (value.length > ANNOUNCEMENT_MAX_LENGTH) return fail(`公告不能超过 ${ANNOUNCEMENT_MAX_LENGTH} 个字`);
    settings.announcementText = value;
  }
  if (has("announcementLink")) {
    const value = text("announcementLink");
    if (value.length > 500 || !isSafeAnnouncementLink(value)) {
      return fail("公告链接必须是 https:// 地址，或以 / 开头的站内路径");
    }
    settings.announcementLink = value;
  }
  if (has("announcementTone")) {
    if (!TONES.includes(input.announcementTone)) return fail("公告样式无效");
    settings.announcementTone = input.announcementTone;
  }
  for (const key of BOOLEAN_KEYS) {
    if (!has(key)) continue;
    if (typeof input[key] !== "boolean") return fail("开关设置无效");
    settings[key] = input[key];
  }

  if (settings.announcementEnabled === true && has("announcementText") && !settings.announcementText) {
    return fail("开启公告前请填写公告内容");
  }
  if (!Object.keys(settings).length) return fail("没有需要保存的内容");
  return { settings };
}
