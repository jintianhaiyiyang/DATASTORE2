# 📊 DataStore - 数据小商店

DataStore 是一个基于 Next.js 的数字资产交易平台，支持数据集（Dataset）售卖与文章（Article）内容管理，集成微信支付、Vercel KV 与 Iron Session。

## ✨ 功能亮点

- **🛒 数据集市**：浏览、搜索并购买数据集，支付后解锁下载。
- **📝 内容管理**：内置后台，发布/编辑文章与数据集。
- **🎛️ 站点设置**：后台可编辑首页 Logo、标题与底部小字。
- **🔐 权限体系**：普通用户登录购买，管理员管理全站内容。
- **☁️ Serverless**：面向 Vercel 的无服务器架构与 KV 存储。
- **🎨 黑金 UI**：深色高端风格，移动端适配。

## 🧰 技术栈

- **框架**：Next.js (React)
- **部署**：Vercel
- **数据库**：Vercel KV (Redis)
- **支付**：wechatpay-node-v3
- **认证**：iron-session + bcrypt
- **搜索/工具**：Fuse.js, QRCode.react
- **邮件**：nodemailer (用于验证码)

## 🚀 快速开始

### 1) 环境变量
在项目根目录创建 `.env.local`（线上请在 Vercel Settings 配置）：

```bash
# 站点地址 (回调需要)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 身份验证加密 (32 位以上随机字符)
COOKIE_PASSWORD=complex_password_at_least_32_characters_long

# 微信支付配置
WX_APP_ID=你的AppID
WX_MCH_ID=你的商户号
WX_API_V3_KEY=你的APIv3密钥
WX_CERT=你的商户证书内容
WX_KEY=你的商户私钥内容

# Vercel KV (由 Vercel 自动注入，本地开发可运行 `vercel env pull`)
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# 管理员账号 (可选，代码中有默认值)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 邮件发送 (验证码)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_USER=your_user
EMAIL_PASS=your_pass
EMAIL_FROM=DataStore <noreply@example.com>
# 可选：关闭证书校验（不推荐）
EMAIL_TLS_REJECT_UNAUTHORIZED=true
```

### 2) 安装与运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000 访问前台。

### 3) 后台管理

访问 http://localhost:3000/admin  
默认账号：`admin`  
默认密码：`admin123`

## 📂 目录结构

- `pages/api/*`：Serverless API（Auth、Pay、CMS）
- `pages/admin/*`：后台页面
- `pages/dataset/*`：数据集详情与支付页
- `lib/db.js`：KV 数据读写封装
- `styles/*`：全局与模块化样式

## 🔒 安全说明（邮件验证码）

- 验证码使用加密随机数生成。
- 发送限流：Session + IP + Email 三重限制（默认 60 秒）。
- 验证码过期校验与尝试次数限制。
- SMTP 默认启用证书校验（可通过环境变量关闭）。

## 📜 部署

1. Fork 或 Clone 本仓库
2. 在 Vercel 导入项目
3. 配置环境变量
4. 绑定 KV Database
5. Deploy

© 2026 DataStore. All rights reserved.
