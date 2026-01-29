import { withIronSessionApiRoute } from "../../lib/session";
import { getSiteSettings, saveSiteSettings } from "../../lib/db";

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
    const user = req.session.user;
    if (!user || !user.isLoggedIn || !user.isAdmin) {
      return res.status(403).json({ message: "无权操作" });
    }

    const { siteTitle, logoUrl, footerText } = req.body || {};
    const payload = {
      siteTitle: typeof siteTitle === "string" ? siteTitle.trim() : "",
      logoUrl: typeof logoUrl === "string" ? logoUrl.trim() : "",
      footerText: typeof footerText === "string" ? footerText.trim() : "",
    };

    if (!payload.siteTitle) {
      return res.status(400).json({ message: "标题不能为空" });
    }

    if (payload.siteTitle.length > 60) {
      return res.status(400).json({ message: "标题过长" });
    }

    if (payload.footerText.length > 200) {
      return res.status(400).json({ message: "底部小字过长" });
    }

    if (payload.logoUrl.length > 400000) {
      return res.status(400).json({ message: "Logo 数据过大" });
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
  return res.status(405).end("Method Not Allowed");
}

export default withIronSessionApiRoute(siteHandler);
