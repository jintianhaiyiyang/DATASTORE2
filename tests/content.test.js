import { describe, expect, it } from "vitest";
import {
  cleanTags,
  isHttpUrl,
  isSafeLogoUrl,
  sanitizeRichText,
} from "../lib/content";

describe("content sanitization", () => {
  it("removes scripts, event handlers, and unsafe URLs", () => {
    const result = sanitizeRichText(
      '<p onclick="steal()">安全</p><script>alert(1)</script><a href="javascript:alert(1)">链接</a>'
    );
    expect(result).toContain("安全");
    expect(result).not.toMatch(/script|onclick|javascript:/i);
  });

  it("normalizes and bounds tags", () => {
    expect(cleanTags([" 数据 ", "数据", "<b>商业</b>"])).toEqual(["数据", "商业"]);
  });

  it("keeps ordinary ampersands readable in plain text", () => {
    expect(cleanTags(["A & B"])).toEqual(["A & B"]);
  });

  it("only accepts safe download and logo URLs", () => {
    expect(isHttpUrl("https://example.com/file")).toBe(true);
    expect(isHttpUrl("http://example.com/file")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeLogoUrl("data:image/png;base64,aGVsbG8=")).toBe(true);
    expect(isSafeLogoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
  });
});
