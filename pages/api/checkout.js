import { withIronSessionApiRoute } from "../../lib/session";
import { getDatasets } from "../../lib/db";
import { createWxPay, unwrapWxResult } from "../../lib/wxpay";

async function checkoutHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

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

  try {
    const datasets = await getDatasets();
    const dataset = datasets.find((d) => String(d.id) === String(datasetId));

    if (!dataset) {
      return res.status(404).json({ message: "资源不存在或已下架" });
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

    const outTradeNo = `ORDER_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      return res.status(500).json({ message: "站点地址未配置（NEXT_PUBLIC_SITE_URL）" });
    }

    const wxpay = createWxPay();
    const tradeType =
      clientType === "h5" ? "h5" : clientType === "jsapi" ? "jsapi" : "native";
    const description = `购买: ${dataset.name}`.slice(0, 127);
    const attach = JSON.stringify({
      datasetId: String(datasetId),
      email: user.email,
    });
    const baseParams = {
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      description,
      out_trade_no: outTradeNo,
      notify_url: `${siteUrl.replace(/\/$/, "")}/api/notify/wechat`,
      amount: { total: amountInCents, currency: "CNY" },
      attach,
    };

    if (tradeType === "jsapi") {
      const openid = req.session.wechatOpenId;
      if (!openid) {
        return res.status(401).json({ needOauth: true, message: "需要微信授权" });
      }

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
      const nonceStr = Math.random().toString(36).slice(2, 15);
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
      const forwarded = req.headers["x-forwarded-for"];
      const rawIp = Array.isArray(forwarded)
        ? forwarded[0]
        : (forwarded || "").split(",")[0].trim();
      const socketIp = req.socket?.remoteAddress || "";
      const clientIp = (rawIp || socketIp || "127.0.0.1").replace("::ffff:", "");

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
    console.error("支付初始化错误:", err);
    return res.status(500).json({ message: "支付初始化失败: " + err.message });
  }
}

export default withIronSessionApiRoute(checkoutHandler);
