import { withIronSessionApiRoute } from "../../lib/session";
import WxPay from 'wechatpay-node-v3';
import { updateUserPurchase } from "../../lib/db";

async function handler(req, res) {
  // 1. 强制禁用缓存
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

    // 2. 查询订单
    const result = await wxpay.query({ out_trade_no: orderId });
    
    // 🔍 关键修复：打印完整的返回结构，帮您看清真相
    console.log(`[完整调试] 微信返回结果: ${JSON.stringify(result)}`);

    // 🛠️ 兼容修复：有时候数据在 result 里，有时候在 result.data 里
    const data = result.data || result;
    const tradeState = data.trade_state;

    console.log(`[查询日志] 订单 ${orderId} 最终状态: ${tradeState}`);

    // 3. 判断状态
    if (tradeState === 'SUCCESS') {
      // 这里的 attach 也可能在 data 里
      const attach = JSON.parse(data.attach || "{}");
      
      // 写入数据库
      if (attach.datasetId) {
        console.log(`[数据库] 正在解锁数据集 ${attach.datasetId}`);
        await updateUserPurchase(user.email, Number(attach.datasetId));
      }
      
      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({ paid: false, state: tradeState });

  } catch (error) {
    console.error("[查询报错] 接口异常:", error.message);
    return res.status(500).json({ paid: false, error: error.message });
  }
}

export default withIronSessionApiRoute(handler);
