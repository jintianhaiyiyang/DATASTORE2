import { withIronSessionApiRoute } from "../../../../lib/session";

export default withIronSessionApiRoute(async function wechatOauthStart(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const appId = process.env.WX_APP_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!appId || !siteUrl) {
    return res.status(500).json({ message: "??????" });
  }

  const redirectParam = typeof req.query.redirect === "string" ? req.query.redirect : "";
  let redirectUrl = siteUrl;
  try {
    if (redirectParam && redirectParam.startsWith(siteUrl)) {
      redirectUrl = redirectParam;
    }
  } catch (e) {
    // ignore invalid redirect
  }

  const state = Math.random().toString(36).slice(2, 10);
  req.session.wxOAuthState = state;
  req.session.wxOAuthRedirect = redirectUrl;
  await req.session.save();

  const callbackUrl = `${siteUrl}/api/wechat/oauth/callback`;
  const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${encodeURIComponent(
    callbackUrl
  )}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`;

  res.redirect(authUrl);
});
