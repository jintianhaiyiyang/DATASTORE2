import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';
import { getDatasets } from "../../lib/db"; // ⬅️ 确保引入了获取数据的函数

async function checkoutHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = req.session.user;
  if (!user || !user.isLoggedIn) return res.status(401).json({ message: "请先登录" });

  const { datasetId } = req.body;
  
  try {
    // 1. 获取该数据集的真实价格
    const datasets = await getDatasets();
    const dataset = datasets.find(d => d.id === Number(datasetId));
    if (!dataset) throw new Error("资源不存在");

    // 微信支付单位是分，需将元转成分
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

    const result = await wxpay.transactions_native({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      description: `购买数据: ${dataset.name}`,
      out_trade_no: outTradeNo,
      notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
      amount: { total: amountInCents, currency: 'CNY' }, // ⬅️ 修复：使用动态价格
      attach: JSON.stringify({ datasetId, email: user.email })
    });

    const codeUrl = result.code_url || (result.data && result.data.code_url);
    // 返回 orderId (即 outTradeNo) 供前端轮询
    return res.status(200).json({ type: "qrcode", codeUrl, outTradeNo });
    
  } catch (err) {
    return res.status(500).json({ message: "支付初始化失败: " + err.message });
  }
}
export default withIronSessionApiRoute(checkoutHandler);
