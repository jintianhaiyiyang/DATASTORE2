import { withIronSessionApiRoute } from "../../../../lib/session";

export default withIronSessionApiRoute(async function wechatOauthCallback(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const appId = process.env.WX_APP_ID;
  const appSecret = process.env.WX_APP_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    return res.status(500).json({ message: "微信配置缺失" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).json({ message: "缺少授权码" });

  if (!req.session.wxOAuthState || state !== req.session.wxOAuthState) {
    return res.status(400).json({ message: "state 校验失败" });
  }

  // One-time state
  const redirectUrl = req.session.wxOAuthRedirect || siteUrl;
  req.session.wxOAuthState = undefined;
  req.session.wxOAuthRedirect = undefined;

  try {
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;
    const resp = await fetch(tokenUrl);
    const data = await resp.json();

    if (!data.openid) {
      await req.session.save();
      return res.status(500).json({
        message: "获取 openid 失败",
        detail: data,
      });
    }

    req.session.wechatOpenId = data.openid;
    await req.session.save();

    // Only allow redirects back to our own site
    let safeRedirect = siteUrl;
    try {
      if (
        typeof redirectUrl === "string" &&
        redirectUrl.startsWith(siteUrl.replace(/\/$/, ""))
      ) {
        safeRedirect = redirectUrl;
      }
    } catch {
      // keep default
    }

    res.redirect(safeRedirect);
  } catch (err) {
    console.error("wechat oauth error", err);
    await req.session.save();
    return res.status(500).json({ message: "微信授权失败" });
  }
});
