import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';
import { updateUserPurchase } from "../../lib/db";

async function handler(req, res) {
  // 🟢 新增：强制禁用浏览器缓存，防止出现 304
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const user = req.session.user;
  if (!user || !user.isLoggedIn) return res.status(401).json({ paid: false });

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

    const result = await wxpay.query({ out_trade_no: orderId });
    console.log(`[查询日志] 订单 ${orderId} 状态: ${result.trade_state}`);

    if (result.trade_state === 'SUCCESS') {
      const attach = JSON.parse(result.attach || "{}");
      // 解锁权限
      await updateUserPurchase(user.email, Number(attach.datasetId));
      return res.status(200).json({ paid: true });
    }

    // 只要不是 SUCCESS，就返回 paid: false
    return res.status(200).json({ paid: false });
  } catch (error) {
    console.error("查询失败:", error);
    return res.status(500).json({ paid: false });
  }
}

export default withIronSessionApiRoute(handler);
