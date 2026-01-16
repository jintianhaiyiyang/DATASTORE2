# DATASTORE
# 📊 DataStore - 数据小商店

DataStore 是一个基于 **Next.js** 构建的现代化数字资产交易平台。支持数据集（Dataset）的发布与售卖，以及深度文章（Article）的内容管理。

项目集成了 **微信支付 (WeChat Pay)**、**Vercel KV 云数据库** 以及 **Iron Session** 身份验证，提供完整的商业闭环体验。

## ✨ 核心功能

* **🛒 数据集市**：浏览、搜索并购买高价值数据集。
* **💳 微信支付**：集成 Native 扫码支付，支付成功后自动解锁下载权限。
* **📝 内容管理**：内置 CMS 后台，支持发布富文本文章和数据集产品。
* **🔐 权限体系**：
    * **普通用户**：注册/登录、购买资源、查看已购记录。
    * **超级管理员**：进入 `/admin` 后台，管理所有资源。
* **☁️ 云端架构**：完全适配 Serverless 环境，使用 Vercel KV 存储数据，不再依赖本地文件。
* **🎨 黑金 UI**：全站采用高端深色商务风格设计，适配移动端。

## 🛠️ 技术栈

* **框架**: [Next.js](https://nextjs.org/) (React)
* **部署**: [Vercel](https://vercel.com/)
* **数据库**: [Vercel KV](https://vercel.com/docs/storage/kv) (Redis)
* **支付**: [wechatpay-node-v3](https://github.com/kருங்க/wechatpay-node-v3)
* **认证**: [iron-session](https://github.com/vvo/iron-session)
* **工具**: Fuse.js (搜索), QRCode.react (二维码)

## 🚀 快速开始

### 1. 环境变量配置
在项目根目录创建 `.env.local` 文件（线上部署请在 Vercel Settings 中配置）：

```bash
# 站点地址 (回调需要)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 身份验证加密 (32位以上随机字符)
COOKIE_PASSWORD=complex_password_at_least_32_characters_long

# 微信支付配置
WX_APP_ID=你的AppID
WX_MCH_ID=你的商户号
WX_API_V3_KEY=你的APIv3密钥
WX_CERT=你的商户证书内容
WX_KEY=你的商户私钥内容

# Vercel KV (由 Vercel 自动注入，本地开发需运行 `vercel env pull`)
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# 管理员账号 (可选，代码中有默认值)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
2. 安装与运行
Bash

# 安装依赖
npm install

# 启动开发服务器
npm run dev
访问 http://localhost:3000 即可查看效果。

3. 后台管理
访问 http://localhost:3000/admin。

默认账号: admin

默认密码: admin123

📂 目录结构
pages/api/*: 后端 Serverless 接口 (Auth, Pay, CMS)

pages/admin/*: 管理员后台页面

pages/dataset/*: 数据集详情与支付页

lib/db.js: 云数据库操作封装 (Vercel KV)

styles/*: 全局与模块化样式

📜 部署
本项目专为 Vercel 优化。

Fork 或 Clone 本仓库。

在 Vercel 导入项目。

配置上述环境变量。

绑定 KV Database。

Deploy!

© 2026 DataStore. All rights reserved.


### 🚀 总结操作
1.  **覆盖 `pages/api/articles/[id].js`**：让文章详情能从数据库读出来。
2.  **覆盖 `pages/article/[id].js`**：让文章页面变漂亮。
3.  **新建 `README.md`**：记录项目信息。
4.  **Redeploy**：提交代码并重新部署。

完成后，您在首页点击任何一篇文章，应该就能完美显示深色背景的内容了！
