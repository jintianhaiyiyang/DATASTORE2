import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';
import { getDatasets } from "../../lib/db"; // ⬅️ 现在能找到这个函数了

async function checkoutHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = req.session.user;
  if (!user || !user.isLoggedIn) return res.status(401).json({ message: "请先登录" });

  const { datasetId, clientType } = req.body;
  
  try {
    // 1. 获取数据集并动态计算价格
    const datasets = await getDatasets();
    const dataset = datasets.find(d => d.id === Number(datasetId));
    
    if (!dataset) throw new Error("资源不存在或已下架");

    // 🔴 核心修复：0.02 元转为 2 分
    const amountInCents = Math.round(dataset.price * 100); 

    const outTradeNo = `ORDER_${Date.now()}`;
    const wxCert = (process.env.WX_CERT || "").replace(/\\n/g, '\n');
    const wxKey = (process.env.WX_KEY || "").replace(/\\n/g, '\n');

    const wxpay = new WxPay({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      publicKey: wxCert,
      privateKey: wxKey,
      key: process.env.WX_API_V3_KEY,
    });

    // 2. 请求微信统一下单
    const tradeType = clientType === "h5" ? "h5" : (clientType === "jsapi" ? "jsapi" : "native");

    if (tradeType === "jsapi") {
      const openid = req.session.wechatOpenId;
      if (!openid) {
        return res.status(401).json({ needOauth: true, message: "需要微信授权" });
      }

      const result = await wxpay.transactions_jsapi({
        appid: process.env.WX_APP_ID,
        mchid: process.env.WX_MCH_ID,
        description: `购买: ${dataset.name}`,
        out_trade_no: outTradeNo,
        notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
        amount: { total: amountInCents, currency: 'CNY' },
        payer: { openid },
        attach: JSON.stringify({ datasetId, email: user.email })
      });

      const prepayId = result.prepay_id || (result.data && result.data.prepay_id);
      if (!prepayId) throw new Error("JSAPI预支付单创建失败");

      const timeStamp = Math.floor(Date.now() / 1000).toString();
      const nonceStr = Math.random().toString(36).substr(2, 15);
      const pkg = `prepay_id=${prepayId}`;
      const paySign = wxpay.sign(`${process.env.WX_APP_ID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`);

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
      const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
      const clientIp = (rawIp || socketIp || "127.0.0.1").replace("::ffff:", "");

      const result = await wxpay.transactions_h5({
        appid: process.env.WX_APP_ID,
        mchid: process.env.WX_MCH_ID,
        description: `购买: ${dataset.name}`,
        out_trade_no: outTradeNo,
        notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
        amount: { total: amountInCents, currency: 'CNY' },
        scene_info: {
          payer_client_ip: clientIp,
          h5_info: { type: "Wap" },
        },
        attach: JSON.stringify({ datasetId, email: user.email })
      });

      const mwebUrl = result.mweb_url || (result.data && result.data.mweb_url);
      return res.status(200).json({ type: "h5", mwebUrl, outTradeNo });
    }

    const result = await wxpay.transactions_native({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
        description: `购买: ${dataset.name}`,
      out_trade_no: outTradeNo,
      notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
      amount: { total: amountInCents, currency: 'CNY' }, // 这里的 total 现在是动态的了
      attach: JSON.stringify({ datasetId, email: user.email })
    });

    const codeUrl = result.code_url || (result.data && result.data.code_url);
    return res.status(200).json({ type: "qrcode", codeUrl, outTradeNo });
    
  } catch (err) {
    console.error("支付初始化错误:", err);
    return res.status(500).json({ message: "支付初始化失败: " + err.message });
  }
}
export default withIronSessionApiRoute(checkoutHandler);
