import { withIronSessionApiRoute } from "../../../../lib/session";

export default withIronSessionApiRoute(async function wechatOauthCallback(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const appId = process.env.WX_APP_ID;
  const appSecret = process.env.WX_APP_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!appId || !appSecret || !siteUrl) {
    return res.status(500).json({ message: "??????" });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).json({ message: "?????" });

  if (!req.session.wxOAuthState || state !== req.session.wxOAuthState) {
    return res.status(400).json({ message: "state ????" });
  }

  try {
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`;
    const resp = await fetch(tokenUrl);
    const data = await resp.json();

    if (!data.openid) {
      return res.status(500).json({ message: "?? openid ??", detail: data });
    }

    req.session.wechatOpenId = data.openid;
    await req.session.save();

    const redirectUrl = req.session.wxOAuthRedirect || siteUrl;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error("wechat oauth error", err);
    return res.status(500).json({ message: "??????" });
  }
});
