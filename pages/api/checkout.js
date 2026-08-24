import { withIronSessionApiRoute } from "../../lib/session";
import { getDatasets, getPurchasedIds, saveOrder } from "../../lib/db";
import { createWxPay, unwrapWxResult } from "../../lib/wxpay";
import { consumeRateLimit } from "../../lib/rateLimit";
import {
  getClientIp,
  hashKey,
  normalizeEmail,
  paymentOrderId,
  randomId,
  requireSameOrigin,
} from "../../lib/security";

async function checkoutHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  if (!requireSameOrigin(req, res)) return;

  const user = req.session.user;
  if (!user || !user.isLoggedIn) {
    return res.status(401).json({ message: "请先登录" });
  }

  if (!user.email) {
    return res.status(400).json({
      message: "当前账号无法购买（管理员账号请使用普通用户邮箱登录）",
    });
  }

  const { datasetId, clientType } = req.body || {};
  if (datasetId === undefined || datasetId === null || datasetId === "") {
    return res.status(400).json({ message: "缺少 datasetId" });
  }
  if (clientType && !["native", "h5", "jsapi"].includes(clientType)) {
    return res.status(400).json({ message: "支付类型无效" });
  }

  try {
    const datasets = await getDatasets();
    const dataset = datasets.find((d) => String(d.id) === String(datasetId));

    if (!dataset) {
      return res.status(404).json({ message: "资源不存在或已下架" });
    }

    const email = normalizeEmail(user.email);
    const purchasedIds = await getPurchasedIds(email);
    if (purchasedIds.includes(String(dataset.id))) {
      return res.status(409).json({ message: "你已购买该资源，请直接下载" });
    }

    const rate = await consumeRateLimit(
      `rate:checkout:${hashKey(`${email}:${dataset.id}`)}`,
      { limit: 5, windowSeconds: 60 }
    );
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfter));
      return res.status(429).json({ message: "创建订单过于频繁，请稍后再试" });
    }

    const price = Number(dataset.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "商品价格无效" });
    }

    // Free items do not need payment
    if (price === 0) {
      return res.status(400).json({ message: "该资源免费，无需支付" });
    }

    const amountInCents = Math.round(price * 100);
    if (amountInCents < 1) {
      return res.status(400).json({ message: "支付金额过低" });
    }

    const outTradeNo = paymentOrderId();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return res.status(500).json({ message: "站点地址未配置（NEXT_PUBLIC_SITE_URL）" });
    }
    let normalizedSiteUrl;
    try {
      normalizedSiteUrl = new URL(siteUrl);
      if (!["http:", "https:"].includes(normalizedSiteUrl.protocol)) throw new Error();
      if (process.env.NODE_ENV === "production" && normalizedSiteUrl.protocol !== "https:") {
        return res.status(500).json({ message: "生产环境站点地址必须使用 HTTPS" });
      }
    } catch {
      return res.status(500).json({ message: "站点地址配置无效" });
    }

    const wxpay = createWxPay();
    const tradeType =
      clientType === "h5" ? "h5" : clientType === "jsapi" ? "jsapi" : "native";
    if (
      tradeType === "jsapi" &&
      (!req.session.wechatOpenId ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(req.session.wechatOpenId))
    ) {
      return res.status(401).json({ needOauth: true, message: "需要微信授权" });
    }
    const clientIp = tradeType === "h5" ? getClientIp(req) : null;
    if (tradeType === "h5" && clientIp === "unknown") {
      return res.status(400).json({ message: "无法识别客户端 IP" });
    }
    const description = `购买: ${dataset.name}`.slice(0, 127);
    const attach = JSON.stringify({ orderId: outTradeNo });
    const baseParams = {
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      description,
      out_trade_no: outTradeNo,
      notify_url: new URL("/api/notify/wechat", normalizedSiteUrl).toString(),
      amount: { total: amountInCents, currency: "CNY" },
      attach,
    };

    await saveOrder({
      id: outTradeNo,
      datasetId: String(dataset.id),
      email,
      amount: amountInCents,
      currency: "CNY",
      clientType: tradeType,
    });

    if (tradeType === "jsapi") {
      const openid = req.session.wechatOpenId;

      const result = await wxpay.transactions_jsapi({
        ...baseParams,
        payer: { openid },
      });

      const data = unwrapWxResult(result);
      const prepayId = data.prepay_id;
      if (!prepayId) {
        throw new Error("JSAPI预支付单创建失败");
      }

      const timeStamp = Math.floor(Date.now() / 1000).toString();
      const nonceStr = randomId().slice(-24);
      const pkg = `prepay_id=${prepayId}`;
      // JSAPI paySign message format required by WeChat
      const paySign = wxpay.sign(
        `${process.env.WX_APP_ID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
      );

      return res.status(200).json({
        type: "jsapi",
        outTradeNo,
        payParams: {
          appId: process.env.WX_APP_ID,
          timeStamp,
          nonceStr,
          package: pkg,
          signType: "RSA",
          paySign,
        },
      });
    }

    if (tradeType === "h5") {
      const result = await wxpay.transactions_h5({
        ...baseParams,
        scene_info: {
          payer_client_ip: clientIp,
          h5_info: { type: "Wap" },
        },
      });

      const data = unwrapWxResult(result);
      const mwebUrl = data.mweb_url;
      if (!mwebUrl) {
        throw new Error("H5 支付链接创建失败");
      }
      return res.status(200).json({ type: "h5", mwebUrl, outTradeNo });
    }

    const result = await wxpay.transactions_native(baseParams);
    const data = unwrapWxResult(result);
    const codeUrl = data.code_url;
    if (!codeUrl) {
      throw new Error("Native 支付二维码创建失败");
    }
    return res.status(200).json({ type: "qrcode", codeUrl, outTradeNo });
  } catch (err) {
    console.error("支付初始化错误:", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
      providerMessage: err?.providerMessage,
    });
    return res.status(500).json({ message: "支付初始化失败，请稍后重试" });
  }
}

export default withIronSessionApiRoute(checkoutHandler);
