import { withIronSessionApiRoute } from "../../lib/session";
import { getSiteSettings, saveSiteSettings } from "../../lib/db";
import { parseSiteSettingsUpdate } from "../../lib/siteSettings";
import { paymentConfigured, withPaymentAvailability } from "../../lib/paymentConfig";
import { requireSameOrigin } from "../../lib/security";

function isAdmin(req) {
  const user = req.session.user;
  return !!(user && user.isLoggedIn && user.isAdmin);
}

function present(req, settings) {
  const result = withPaymentAvailability(settings);
  // Which keys are configured is only useful to the admin settings page.
  if (isAdmin(req)) result.paymentConfigured = paymentConfigured();
  return result;
}

async function siteHandler(req, res) {
  if (req.method === "GET") {
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(present(req, await getSiteSettings()));
    } catch (error) {
      console.error("获取站点设置失败:", error);
      return res.status(500).json({ message: "获取站点设置失败" });
    }
  }

  if (req.method === "PUT") {
    if (!requireSameOrigin(req, res)) return;
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "无权操作" });
    }

    const { settings, error } = parseSiteSettingsUpdate(req.body);
    if (error) return res.status(400).json({ message: error });

    try {
      const updated = await saveSiteSettings(settings);
      return res.status(200).json(present(req, updated));
    } catch (err) {
      console.error("保存站点设置失败:", err);
      return res.status(500).json({ message: "保存站点设置失败" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).json({ message: "Method Not Allowed" });
}

export default withIronSessionApiRoute(siteHandler);
