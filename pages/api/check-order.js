import { withIronSessionApiRoute } from "../../lib/session";
import { updateUserPurchase } from "../../lib/db";
import { createWxPay, unwrapWxResult } from "../../lib/wxpay";

async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ paid: false, message: "Method Not Allowed" });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const user = req.session.user;
  if (!user || !user.isLoggedIn) {
    return res.status(401).json({ paid: false });
  }

  const orderId = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
  if (!orderId || orderId.length > 64) {
    return res.status(400).json({ paid: false, message: "无效的订单号" });
  }

  try {
    const wxpay = createWxPay();
    const result = await wxpay.query({ out_trade_no: orderId });
    const data = unwrapWxResult(result);
    const tradeState = data.trade_state;

    if (tradeState === "SUCCESS") {
      let attach = {};
      try {
        attach = JSON.parse(data.attach || "{}");
      } catch {
        attach = {};
      }

      // Security: only unlock for the user who created this order
      if (attach.email && user.email && attach.email !== user.email) {
        return res.status(403).json({
          paid: false,
          message: "订单与当前用户不匹配",
        });
      }

      const emailToUnlock = attach.email || user.email;
      const datasetId = attach.datasetId;

      if (emailToUnlock && datasetId !== undefined && datasetId !== null && datasetId !== "") {
        await updateUserPurchase(emailToUnlock, datasetId);
      }

      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({ paid: false, state: tradeState || null });
  } catch (error) {
    console.error("[查询报错] 接口异常:", error.message);
    return res.status(500).json({ paid: false, error: error.message });
  }
}

export default withIronSessionApiRoute(handler);
