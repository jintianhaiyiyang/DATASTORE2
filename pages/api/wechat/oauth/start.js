import { withIronSessionApiRoute } from "../../../../lib/session";
import {
  randomId,
  resolveSameOriginRedirect,
} from "../../../../lib/security";

export default withIronSessionApiRoute(async function wechatOauthStart(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!req.session.user?.isLoggedIn || !req.session.user.email) {
    return res.status(401).json({ message: "请先登录" });
  }

  const appId = process.env.WX_APP_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!appId || !siteUrl) {
    return res.status(500).json({ message: "微信配置缺失" });
  }

  let redirectUrl;
  try {
    redirectUrl = resolveSameOriginRedirect(req.query.redirect, siteUrl);
  } catch {
    return res.status(500).json({ message: "站点地址配置无效" });
  }

  const state = randomId("wx_");
  req.session.wxOAuthState = state;
  req.session.wxOAuthRedirect = redirectUrl;
  await req.session.save();

  const callbackUrl = new URL("/api/wechat/oauth/callback", siteUrl).toString();
  const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(
    callbackUrl
  )}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;

  res.redirect(authUrl);
});
