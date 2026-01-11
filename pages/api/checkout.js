import { withIronSessionApiRoute } from "../../lib/session";
import AlipaySdk from 'alipay-sdk';
import WxPay from 'wechatpay-node-v3';
import fs from 'fs';
import path from 'path';

// ✅ 1. 手动定义 AlipayFormData 类，解决 import 报错 (Module not found)
class AlipayFormData {
  constructor() {
    this.method = 'post';
    this.fields = [];
  }
  setMethod(method) {
    this.method = method;
  }
  addField(name, value) {
    this.fields.push({ name, value });
  }
}

const dataFilePath = path.join(process.cwd(), "data", "datasets.json");

async function checkoutHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const user = req.session.user;
  // 🔒 权限校验
  if (!user || !user.isLoggedIn) {
    return res.status(401).json({ message: "请先登录后再购买" });
  }

  const { datasetId, paymentMethod } = req.body;
  
  // 读取数据集信息
  let dataset = null;
  try {
    const datasets = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    dataset = datasets.find(d => d.id === Number(datasetId));
  } catch (e) {
    return res.status(500).json({ message: "系统错误：数据集读取失败" });
  }

  if (!dataset) return res.status(404).json({ message: "该资源不存在或已下架" });

  // 生成唯一订单号和附加信息
  const outTradeNo = `ORDER_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const attach = JSON.stringify({ datasetId, email: user.email });

  try {
    // ==========================================
    // 🔵 1. 支付宝支付 (Alipay Sandbox)
    // ==========================================
    if (paymentMethod === "alipay") {
      // 检查环境变量是否配置 (看您截图里好像还是占位符，如果没填会在这里报错)
      if (!process.env.ALIPAY_PRIVATE_KEY || process.env.ALIPAY_PRIVATE_KEY.startsWith("你的")) {
         return res.status(500).json({ message: "服务端未配置支付宝参数" });
      }

      const alipaySdk = new AlipaySdk({
        appId: process.env.ALIPAY_APP_ID,
        privateKey: process.env.ALIPAY_PRIVATE_KEY,
        alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
        gateway: "https://openapi.alipaydev.com/gateway.do", // 沙箱网关
      });

      const formData = new AlipayFormData();
      formData.setMethod('get'); 
      
      formData.addField('notifyUrl', `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/alipay`);
      formData.addField('returnUrl', `${process.env.NEXT_PUBLIC_SITE_URL}/dataset/${datasetId}`); 
      
      formData.addField('bizContent', {
        outTradeNo,
        productCode: 'FAST_INSTANT_TRADE_PAY',
        totalAmount: dataset.price.toString(),
        subject: `DataStore: ${dataset.name}`,
        passbackParams: encodeURIComponent(attach),
      });

      const result = await alipaySdk.exec('alipay.trade.page.pay', {}, { formData });
      return res.status(200).json({ type: "url", url: result });
    }

    // ==========================================
    // 🟢 2. 微信支付 (WeChat Pay Native)
    // ==========================================
    if (paymentMethod === "wechat") {
      
      // ✅ 关键修复：正确获取根目录下的证书路径
      const certPath = path.join(process.cwd(), 'apiclient_cert.pem');
      const keyPath = path.join(process.cwd(), 'apiclient_key.pem');

      // 🔍 调试日志：打印路径看看到底在哪找 (在终端能看到)
      console.log("正在寻找证书文件:", certPath);

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.error("❌ 错误：根目录下未找到 apiclient_cert.pem 或 apiclient_key.pem");
        return res.status(500).json({ message: "服务端证书配置缺失" });
      }

      // 检查是否填了真实的商户号
      if (!process.env.WX_MCH_ID || !process.env.WX_API_V3_KEY) {
         return res.status(500).json({ message: "服务端微信商户参数未配置" });
      }

      const wxpay = new WxPay({
        appid: process.env.WX_APP_ID,
        mchid: process.env.WX_MCH_ID,
        publicKey: fs.readFileSync(certPath), // 读取证书
        privateKey: fs.readFileSync(keyPath), // 读取私钥
        key: process.env.WX_API_V3_KEY,      // V3 密钥
      });

      // 发起请求
      const params = {
        appid: process.env.WX_APP_ID,
        mchid: process.env.WX_MCH_ID,
        description: `DATA: ${dataset.name.substring(0, 40)}`,
        out_trade_no: outTradeNo,
        notify_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/notify/wechat`,
        amount: { 
          total: Math.round(dataset.price * 100), // 单位：分
          currency: 'CNY' 
        },
        attach: attach
      };

      console.log("正在请求微信统一下单接口...");
      const result = await wxpay.transactions_native(params);
      console.log("微信接口返回:", result);

      if (!result.code_url) {
         throw new Error("微信未返回二维码链接，可能是商户号或密钥错误");
      }

      return res.status(200).json({ type: "qrcode", codeUrl: result.code_url });
    }

    return res.status(400).json({ message: "未选择支付方式" });

  } catch (err) {
    console.error("支付初始化报错:", err);
    // 提取具体错误信息返回给前端
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    return res.status(500).json({ message: "支付失败: " + errMsg });
  }
}

export default withIronSessionApiRoute(checkoutHandler);