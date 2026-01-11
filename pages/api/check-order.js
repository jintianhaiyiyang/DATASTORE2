import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';
import { updateUserPurchase } from "../../lib/db";

async function handler(req, res) {
  const user = req.session.user;
  if (!user || !user.isLoggedIn) return res.status(401).end();

  const { orderId } = req.query;

  try {
    const wxCert = (process.env.WX_CERT || "").replace(/\\n/g, '\n');
    const wxKey = (process.env.WX_KEY || "").replace(/\\n/g, '\n');

    const wxpay = new WxPay({
      appid: process.env.WX_APP_ID,
      mchid: process.env.WX_MCH_ID,
      publicKey: wxCert,
      privateKey: wxKey,
      key: process.env.WX_API_V3_KEY,
    });

    // 1. 查询微信订单状态
    const result = await wxpay.query({ out_trade_no: orderId });
    
    // 2. 支付成功后的业务处理
    if (result.trade_state === 'SUCCESS') {
      const attach = JSON.parse(result.attach || "{}");
      
      // ✅ 关键：调用 db.js 写入已购记录到 KV 数据库
      if (attach.datasetId) {
        await updateUserPurchase(user.email, Number(attach.datasetId));
      }
      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({ paid: false, state: result.trade_state });
  } catch (error) {
    return res.status(500).json({ paid: false });
  }
}
export default withIronSessionApiRoute(handler);
