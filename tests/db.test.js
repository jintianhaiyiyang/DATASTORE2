import { beforeEach, describe, expect, it, vi } from "vitest";
const kv = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@vercel/kv", () => ({ kv }));
import { getArticles, getDatasets, saveSiteSettings } from "../lib/db";

beforeEach(() => vi.resetAllMocks());

describe("stored content and settings recovery", () => {
  it("does not overwrite settings if the read fails", async () => {
    kv.get.mockRejectedValue(new Error("unavailable"));
    await expect(saveSiteSettings({ siteTitle: "New title" })).rejects.toThrow("unavailable");
    expect(kv.set).not.toHaveBeenCalled();
  });
  it("preserves existing settings on a partial edit", async () => {
    kv.get.mockResolvedValue({ siteTitle: "Old title", aboutContent: "<p>About us</p>", footerText: "Custom footer" });
    const result = await saveSiteSettings({ siteTitle: "New title" });
    expect(result).toMatchObject({ siteTitle: "New title", aboutContent: "<p>About us</p>", footerText: "Custom footer" });
  });
  it("skips malformed legacy records and removes unsafe legacy download links", async () => {
    kv.get.mockResolvedValue([null, "bad", [], { id: "resource1", name: "Dataset", baiduLink: "javascript:alert(1)", downloadUrl: "https://example.com/resource" }]);
    expect(await getDatasets()).toEqual([expect.objectContaining({ id: "resource1", baiduLink: null, downloadUrl: "https://example.com/resource" })]);
    kv.get.mockResolvedValue([null, 1, [], { id: "article1", title: "Article" }]);
    expect(await getArticles()).toEqual([expect.objectContaining({ id: "article1" })]);
  });
});
