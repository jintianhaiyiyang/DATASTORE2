import { withIronSessionApiRoute } from "../../lib/session";
import { getDatasets, getPurchasedIds, getOrder, getSiteSettings, markOrderPaid, saveOrder, updateUserPurchase } from "../../lib/db";
import { isOrderOwner, parsePaymentAttach, validateAlipayPaidOrder, validatePaidOrder } from "../../lib/orderValidation";
import { createWxPay, getJsapiPayParams, truncateUtf8, unwrapWxResult } from "../../lib/wxpay";
import { alipaySubject, closeAlipayTrade, createAlipay, createAlipayPayUrl, isAlipayPaidState, queryAlipayTrade } from "../../lib/alipay";
import { isProviderConfigured, isProviderEnabled } from "../../lib/paymentConfig";
import { consumeRateLimit } from "../../lib/rateLimit";
import {
  getClientIp,
  hashKey,
  normalizeEmail,
  paymentOrderId,
  requireSameOrigin,
} from "../../lib/security";

const CLIENT_TYPES = { wechat: ["native", "h5", "jsapi"], alipay: ["page", "wap"] };
const ALREADY_PAID = { status: 409, body: { message: "你已购买该资源，请直接下载" } };

/**
 * A method switch must not leave two payable orders behind. Returns a
 * response to send, or null when it is safe to create the new order.
 */
async function settlePreviousOrder(previous, email, datasetId) {
  if ((previous.provider || "wechat") === "alipay") {
    // Without credentials the old trade can be neither queried nor paid for.
    if (!isProviderConfigured("alipay")) return null;
    const alipay = createAlipay();
    const trade = await queryAlipayTrade(alipay, previous.id);
    if (isAlipayPaidState(trade.tradeStatus)) {
      if (!validateAlipayPaidOrder({ order: previous, trade, expectedAppId: process.env.ALIPAY_APP_ID })) {
        throw new Error("原订单校验失败");
      }
      if (!await updateUserPurchase(email, datasetId)) throw new Error("购买权限保存失败");
      await markOrderPaid(previous.id, trade.tradeNo);
      return ALREADY_PAID;
    }
    if (trade.tradeStatus === "WAIT_BUYER_PAY") await closeAlipayTrade(alipay, previous.id);
    else if (!["TRADE_NOT_EXIST", "TRADE_CLOSED"].includes(trade.tradeStatus)) throw new Error("无法确认原订单状态");
    return null;
  }

  if (!isProviderConfigured("wechat")) return null;
  const wxpay = createWxPay();
  const payment = unwrapWxResult(await wxpay.query({ out_trade_no: previous.id }));
  if (payment.trade_state === "SUCCESS") {
    if (!validatePaidOrder({ order: previous, payment, attach: parsePaymentAttach(payment.attach),
      expectedAppId: process.env.WX_APP_ID, expectedMchId: process.env.WX_MCH_ID })) throw new Error("原订单校验失败");
    if (!await updateUserPurchase(email, datasetId)) throw new Error("购买权限保存失败");
    await markOrderPaid(previous.id, payment.transaction_id);
    return ALREADY_PAID;
  }
  if (payment.trade_state === "USERPAYING") {
    return { status: 425, body: { message: "原订单正在支付，请先检查支付结果" } };
  }
  if (payment.trade_state === "NOTPAY") {
    unwrapWxResult(await wxpay.close(previous.id));
  } else if (!["CLOSED", "REVOKED", "PAYERROR"].includes(payment.trade_state)) {
    throw new Error("无法确认原订单状态");
  }
  return null;
}

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
  const provider = req.body?.provider ?? "wechat";
  if (datasetId === undefined || datasetId === null || datasetId === "") {
    return res.status(400).json({ message: "缺少 datasetId" });
  }
  if (!Object.hasOwn(CLIENT_TYPES, provider)) {
    return res.status(400).json({ message: "支付方式无效" });
  }
  if (clientType && !CLIENT_TYPES[provider].includes(clientType)) {
    return res.status(400).json({ message: "支付类型无效" });
  }
  if (previousOrderId !== undefined && (typeof previousOrderId !== "string" || !/^[A-Za-z0-9_*\-]{6,64}$/.test(previousOrderId))) {
    return res.status(400).json({ message: "原订单号无效" });
  }

  const tradeType = clientType || CLIENT_TYPES[provider][0];
  let stage = "prepare";
  try {
    const datasets = await getDatasets();
    const dataset = datasets.find((d) => String(d.id) === String(datasetId));

    if (!dataset) {
      return res.status(404).json({ message: "资源不存在或已下架" });
    }

    if (!isProviderEnabled(await getSiteSettings(), provider)) {
      return res.status(403).json({ message: "该支付方式已关闭，请选择其他支付方式" });
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

    const wxpay = provider === "wechat" ? createWxPay() : null;
    const alipay = provider === "alipay" ? createAlipay() : null;
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
    if (previousOrderId) {
      const previous = await getOrder(previousOrderId);
      if (!isOrderOwner(previous, email) || previous.datasetId !== String(dataset.id)) {
        return res.status(404).json({ message: "原订单不存在，请刷新页面重试" });
      }
      if (previous.status === "paid") return res.status(409).json(ALREADY_PAID.body);
      stage = "settle_previous";
      const outcome = await settlePreviousOrder(previous, email, dataset.id);
      if (outcome) return res.status(outcome.status).json(outcome.body);
    }

    stage = "save_order";
    await saveOrder({
      id: outTradeNo,
      provider,
      datasetId: String(dataset.id),
      email,
      amount: amountInCents,
      currency: "CNY",
      clientType: tradeType,
      appid: provider === "alipay" ? process.env.ALIPAY_APP_ID : process.env.WX_APP_ID,
      ...(provider === "wechat" ? { mchid: process.env.WX_MCH_ID } : {}),
    });

    stage = "create_order";
    if (provider === "alipay") {
      // The buyer returns here; payOrder resumes result polling on the page.
      const returnUrl = new URL(`/dataset/${encodeURIComponent(dataset.id)}`, normalizedSiteUrl);
      returnUrl.searchParams.set("payOrder", outTradeNo);
      const payUrl = createAlipayPayUrl(alipay, {
        type: tradeType,
        orderId: outTradeNo,
        amount: amountInCents,
        subject: alipaySubject(dataset.name),
        notifyUrl: new URL("/api/notify/alipay", normalizedSiteUrl).toString(),
        returnUrl: returnUrl.toString(),
      });
      return res.status(200).json({ type: "alipay", payUrl, outTradeNo });
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
      provider,
      paymentType: tradeType,
      stage,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      status: err?.status,
      providerMessage: err?.providerMessage,
    });
    if (provider === "alipay") {
      return res.status(502).json({
        code: "PAYMENT_SERVICE_ERROR",
        message: "暂时无法调起支付宝，请稍后重试或选择其他支付方式",
      });
    }
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
