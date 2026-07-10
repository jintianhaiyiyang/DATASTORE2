import AlipaySdk from "alipay-sdk";
import { updateUserPurchase } from "../../../lib/db";

/**
 * Alipay asynchronous notification.
 * Uses Vercel KV (via updateUserPurchase) instead of local JSON files.
 */
export default async function alipayNotify(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).send("fail");
  }

  try {
    if (
      !process.env.ALIPAY_APP_ID ||
      !process.env.ALIPAY_PRIVATE_KEY ||
      !process.env.ALIPAY_PUBLIC_KEY
    ) {
      console.error("[alipay notify] missing config");
      return res.status(500).send("fail");
    }

    const alipaySdk = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID,
      privateKey: process.env.ALIPAY_PRIVATE_KEY,
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    });

    const isValid = alipaySdk.checkNotifySign(req.body);
    if (!isValid) {
      return res.status(400).send("fail");
    }

    const { trade_status, passback_params } = req.body || {};

    if (trade_status === "TRADE_SUCCESS" || trade_status === "TRADE_FINISHED") {
      let payload = {};
      try {
        payload = JSON.parse(decodeURIComponent(passback_params || "{}"));
      } catch {
        payload = {};
      }

      const { datasetId, email } = payload;
      if (email && datasetId !== undefined && datasetId !== null) {
        await updateUserPurchase(email, datasetId);
      }

      return res.status(200).send("success");
    }

    // Acknowledge non-success notifications without unlocking
    return res.status(200).send("success");
  } catch (error) {
    console.error("[alipay notify] error:", error);
    return res.status(500).send("fail");
  }
}
