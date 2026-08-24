import { withIronSessionApiRoute } from "../../lib/session";
import { getSiteSettings, saveSiteSettings } from "../../lib/db";
import { isSafeLogoUrl, sanitizeRichText } from "../../lib/content";
import { requireSameOrigin } from "../../lib/security";

async function siteHandler(req, res) {
  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "no-store");
      const settings = await getSiteSettings();
      return res.status(200).json(settings);
    } catch (error) {
      console.error("获取站点设置失败:", error);
      return res.status(500).json({ message: "获取站点设置失败" });
    }
  }

  if (req.method === "PUT") {
    if (!requireSameOrigin(req, res)) return;
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作" });
    }

    const { siteTitle, pageTitle, logoUrl, footerText, aboutContent } = req.body || {};
    const payload = {
      siteTitle: typeof siteTitle === "string" ? siteTitle.trim() : "",
      pageTitle: typeof pageTitle === "string" ? pageTitle.trim() : "",
      logoUrl: typeof logoUrl === "string" ? logoUrl.trim() : "",
      footerText: typeof footerText === "string" ? footerText.trim() : "",
      aboutContent:
        typeof aboutContent === "string" ? sanitizeRichText(aboutContent) : "",
    };

    if (!payload.siteTitle) {
      return res.status(400).json({ message: "标题不能为空" });
    }

    if (payload.siteTitle.length > 60) {
      return res.status(400).json({ message: "Title is too long" });
    }

    if (payload.pageTitle && payload.pageTitle.length > 120) {
      return res.status(400).json({ message: "Page title is too long" });
    }

    if (payload.footerText.length > 200) {
      return res.status(400).json({ message: "Footer text is too long" });
    }

    if (payload.aboutContent.length > 5000) {
      return res.status(400).json({ message: "About us is too long" });
    }

    if (payload.logoUrl.length > 400000) {
      return res.status(400).json({ message: "Logo data is too large" });
    }
    if (!isSafeLogoUrl(payload.logoUrl)) {
      return res.status(400).json({ message: "Logo 必须是 HTTPS 地址或常见图片 Data URL" });
    }

    try {
      const updated = await saveSiteSettings(payload);
      return res.status(200).json(updated);
    } catch (error) {
      console.error("保存站点设置失败:", error);
      return res.status(500).json({ message: "保存站点设置失败" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(siteHandler);
