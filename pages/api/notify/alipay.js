import AlipaySdk from 'alipay-sdk';
import fs from 'fs';
import path from 'path';

const usersFilePath = path.join(process.cwd(), "data", "users.json");

export default async function alipayNotify(req, res) {
  const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
  });

  // 1. 验证签名，确保是支付宝发的
  const isValid = alipaySdk.checkNotifySign(req.body);
  if (!isValid) return res.status(400).send("fail");

  const { trade_status, passback_params } = req.body;

  if (trade_status === 'TRADE_SUCCESS') {
    // 2. 解析回传的参数 (datasetId 和 email)
    const { datasetId, email } = JSON.parse(decodeURIComponent(passback_params));

    // 3. 修改 users.json，把 datasetId 加进去
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    const userIndex = users.findIndex(u => u.email === email);

    if (userIndex !== -1) {
      if (!users[userIndex].purchasedIds) users[userIndex].purchasedIds = [];
      if (!users[userIndex].purchasedIds.includes(Number(datasetId))) {
        users[userIndex].purchasedIds.push(Number(datasetId));
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
      }
    }
    return res.status(200).send("success");
  }

  res.send("fail");
}