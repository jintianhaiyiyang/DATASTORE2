import { withIronSessionApiRoute } from "../../lib/session";
import { getDatasets, getPurchasedIds, getOrder, markOrderPaid, saveOrder, updateUserPurchase } from "../../lib/db";
import { isOrderOwner, parsePaymentAttach, validatePaidOrder } from "../../lib/orderValidation";
import { createWxPay, getJsapiPayParams, truncateUtf8, unwrapWxResult } from "../../lib/wxpay";
import { consumeRateLimit } from "../../lib/rateLimit";
import {
  getClientIp,
  hashKey,
  normalizeEmail,
  paymentOrderId,
  requireSameOrigin,
} from "../../lib/security";

async function checkoutHandler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
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

  const { datasetId, clientType, previousOrderId } = req.body || {};
  if (datasetId === undefined || datasetId === null || datasetId === "") {
    return res.status(400).json({ message: "缺少 datasetId" });
  }
  if (clientType && !["native", "h5", "jsapi"].includes(clientType)) {
    return res.status(400).json({ message: "支付类型无效" });
  }
  if (previousOrderId !== undefined && (typeof previousOrderId !== "string" || !/^[A-Za-z0-9_*\-]{6,64}$/.test(previousOrderId))) {
    return res.status(400).json({ message: "原订单号无效" });
  }

  const tradeType = clientType || "native";
  let stage = "prepare";
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
    if (!Number.isFinite(price) || price < 0 || price > 1000000 ||
        Math.round(price * 100) / 100 !== price) {
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
    if (tradeType === "jsapi" && !process.env.WX_APP_SECRET) {
      return res.status(503).json({ message: "暂时无法在微信内调起支付，请使用扫码支付", fallbackType: "native" });
    }
    if (
      tradeType === "jsapi" &&
      (req.session.wechatAppId !== process.env.WX_APP_ID || !req.session.wechatOpenId ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(req.session.wechatOpenId))
    ) {
      return res.status(401).json({ needOauth: true, message: "需要微信授权" });
    }
    const clientIp = tradeType === "h5" ? getClientIp(req) : null;
    if (tradeType === "h5" && clientIp === "unknown") {
      return res.status(400).json({ message: "无法识别客户端 IP" });
    }
    // A manual method switch must not leave two payable orders behind.
    if (previousOrderId) {
      const previous = await getOrder(previousOrderId);
      if (!isOrderOwner(previous, email) || previous.datasetId !== String(dataset.id)) {
        return res.status(404).json({ message: "原订单不存在，请刷新页面重试" });
      }
      if (previous.status === "paid") return res.status(409).json({ message: "你已购买该资源，请直接下载" });
      stage = "query_previous";
      const payment = unwrapWxResult(await wxpay.query({ out_trade_no: previousOrderId }));
      if (payment.trade_state === "SUCCESS") {
        if (!validatePaidOrder({ order: previous, payment, attach: parsePaymentAttach(payment.attach),
          expectedAppId: process.env.WX_APP_ID, expectedMchId: process.env.WX_MCH_ID })) throw new Error("原订单校验失败");
        if (!await updateUserPurchase(email, dataset.id)) throw new Error("购买权限保存失败");
        await markOrderPaid(previousOrderId, payment.transaction_id);
        return res.status(409).json({ message: "你已购买该资源，请直接下载" });
      }
      if (payment.trade_state === "USERPAYING") {
        return res.status(425).json({ message: "原订单正在支付，请先检查支付结果" });
      }
      if (payment.trade_state === "NOTPAY") {
        stage = "close_previous";
        unwrapWxResult(await wxpay.close(previousOrderId));
      } else if (!["CLOSED", "REVOKED", "PAYERROR"].includes(payment.trade_state)) {
        throw new Error("无法确认原订单状态");
      }
    }
    const description = truncateUtf8(`购买: ${dataset.name}`, 127);
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

    stage = "save_order";
    await saveOrder({
      id: outTradeNo,
      datasetId: String(dataset.id),
      email,
      amount: amountInCents,
      currency: "CNY",
      clientType: tradeType,
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
    });

    stage = "create_order";
    if (tradeType === "jsapi") {
      const openid = req.session.wechatOpenId;

      const result = await wxpay.transactions_jsapi({
        ...baseParams,
        payer: { openid },
      });

      const data = unwrapWxResult(result);
      return res.status(200).json({
        type: "jsapi",
        outTradeNo,
        payParams: getJsapiPayParams(data, wxpay, process.env.WX_APP_ID),
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
      const mwebUrl = data.h5_url || data.mweb_url;
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
      paymentType: tradeType,
      stage,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
      providerMessage: err?.providerMessage,
    });
    // A business permission rejection is not a transient gateway failure.
    // Use a stable, safe response; never forward raw SDK payloads or secrets.
    if (err?.name === "WxPayError" && err.code === "NO_AUTH") {
      const label = { h5: "手机网页微信支付", jsapi: "微信内支付", native: "微信扫码支付" }[tradeType];
      return res.status(422).json({
        code: "WECHAT_PAY_NO_AUTH",
        paymentType: tradeType,
        message: stage === "create_order"
          ? `商家的${label}权限未开通或不可用，请联系站点管理员。`
          : "商家的微信支付权限不足，暂时无法处理订单，请联系站点管理员。",
        // A different channel still requires its own permission. Do not
        // create another order automatically, especially while switching.
        fallbackType: stage === "create_order" && tradeType !== "native" ? "native" : undefined,
      });
    }
    return res.status(502).json({
      code: "PAYMENT_SERVICE_ERROR",
      message: tradeType === "native"
        ? "二维码暂时无法生成，请稍后重试或联系站点管理员"
        : "暂时无法调起微信支付，请尝试下方的扫码支付",
      fallbackType: tradeType === "native" ? undefined : "native",
    });
  }
}

export default withIronSessionApiRoute(checkoutHandler);
