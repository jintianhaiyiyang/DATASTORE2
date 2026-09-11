import { withIronSessionApiRoute } from "../../../../lib/session";
import {
  constantTimeEqual,
  resolveSameOriginRedirect,
} from "../../../../lib/security";

export default withIronSessionApiRoute(async function wechatOauthCallback(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!req.session.user?.isLoggedIn || !req.session.user.email) {
    return res.status(401).json({ message: "请先登录" });
  }

  const appId = process.env.WX_APP_ID;
  const appSecret = process.env.WX_APP_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    return res.status(500).json({ message: "微信配置缺失" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || code.length > 256) return res.status(400).json({ message: "缺少授权码" });

  if (
    !req.session.wxOAuthState ||
    !state || !req.session.wxOAuthExpires || req.session.wxOAuthExpires < Date.now() ||
    !constantTimeEqual(state, req.session.wxOAuthState)
  ) {
    return res.status(400).json({ message: "state 校验失败" });
  }

  // One-time state
  const redirectUrl = req.session.wxOAuthRedirect || siteUrl;
  req.session.wxOAuthState = undefined;
  req.session.wxOAuthRedirect = undefined;
  req.session.wxOAuthExpires = undefined;
  await req.session.save();

  const safeRedirect = new URL(resolveSameOriginRedirect(redirectUrl, siteUrl));

  try {
    const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    tokenUrl.search = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      code,
      grant_type: "authorization_code",
    });
    const resp = await fetch(tokenUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`微信接口返回 ${resp.status}`);
    const data = await resp.json();

    if (!data.openid || !/^[A-Za-z0-9_-]{1,128}$/.test(data.openid)) {
      throw new Error("获取 openid 失败");
    }

    req.session.wechatOpenId = data.openid;
    req.session.wechatAppId = appId;
    await req.session.save();

    // Only allow redirects back to our own site
    safeRedirect.searchParams.set("wechatPay", "ready");
    res.redirect(safeRedirect.toString());
  } catch (err) {
    console.error("wechat oauth error", err);
    safeRedirect.searchParams.set("wechatPay", "failed");
    return res.redirect(safeRedirect.toString());
  }
});
