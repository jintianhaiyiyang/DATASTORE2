import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';

async function checkoutHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = req.session.user;
  if (!user || !user.isLoggedIn) return res.status(401).json({ message: "请先登录" });

  const { datasetId } = req.body;
  const outTradeNo = `ORDER_${Date.now()}`;
  
  try {
    // 🔴 核心修复：直接从环境变量读取文本，不使用 fs
    const wxCert = (process.env.WX_CERT || "").replace(/\\n/g, '\n');
    const wxKey = (process.env.WX_KEY || "").replace(/\\n/g, '\n');

    if (!wxCert || !wxKey) throw new Error("服务端证书配置缺失 (WX_CERT/WX_KEY)");

    const wxpay = new WxPay({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      publicKey: wxCert, 
      privateKey: wxKey,
      key: process.env.WX_API_V3_KEY,
    });

    const result = await wxpay.transactions_native({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      description: `数据资源ID: ${datasetId}`,
      out_trade_no: outTradeNo,
      notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
      amount: { total: 1, currency: 'CNY' }, // 测试价格 0.01
      attach: JSON.stringify({ datasetId, email: user.email })
    });

    const codeUrl = result.code_url || (result.data && result.data.code_url);
    return res.status(200).json({ type: "qrcode", codeUrl, outTradeNo });
  } catch (err) {
    return res.status(500).json({ message: "支付初始化失败: " + err.message });
  }
}
export default withIronSessionApiRoute(checkoutHandler);
