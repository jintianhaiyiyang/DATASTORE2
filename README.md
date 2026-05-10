# DataStore - 数据小商店

DataStore 是一个基于 Next.js 的数字资产交易平台，支持数据集（Dataset）售卖与文章（Article）内容管理，集成微信支付、Vercel KV 与 Iron Session。项目包含前台内容展示、后台管理、支付闭环与站点外观配置。

> 适用场景：数据/报告/文档类数字商品的在线售卖与内容发布。
> ## Star History

<a href="https://www.star-history.com/?repos=jintianhaiyiyang%2FDATASTORE2&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=jintianhaiyiyang/DATASTORE2&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=jintianhaiyiyang/DATASTORE2&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=jintianhaiyiyang/DATASTORE2&type=timeline&legend=top-left" />
 </picture>
</a>

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [本地运行](#本地运行)
- [环境变量](#环境变量)
- [后台管理](#后台管理)
- [支付体系](#支付体系)
- [API 参考](#api-参考)
- [数据与存储结构](#数据与存储结构)
- [目录结构](#目录结构)
- [部署到 Vercel](#部署到-vercel)
- [安全与合规](#安全与合规)
- [常见问题](#常见问题)
- [已知限制--todo](#已知限制--todo)
- [License](#license)

---

## 功能概览

- **数据集市**：浏览/搜索/购买数据集，支付后解锁下载链接。
- **内容管理**：文章与数据集的发布、编辑、删除（后台）。
- **站点设置**：后台可编辑站点标题、标签页标题、Logo、底部小字、About 内容。
- **支付体系**：微信支付（Native/H5/JSAPI），设备自动分流。
- **账号体系**：邮箱验证码注册、密码登录、管理员后台。
- **订单核验**：前端轮询订单状态，成功后写入购买记录。
- **深色 UI**：黑金风格，移动端适配。

---

## 技术栈

- **框架**：Next.js 14 / React 18
- **部署**：Vercel
- **存储**：Vercel KV (Redis)
- **支付**：wechatpay-node-v3
- **认证**：iron-session + bcrypt
- **搜索**：Fuse.js
- **二维码**：qrcode.react
- **邮件**：nodemailer（验证码）

---

## 本地运行

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

在根目录创建 `.env.local`，参考 [环境变量](#环境变量)。

### 3) 启动开发环境

```bash
npm run dev
```

访问：
- 前台：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`

---

## 环境变量

> **必填项** 会标注 `required`。

```bash
# 站点地址 (required) - 支付/回调/OAuth 依赖
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Session 加密密钥 (required)
# 需要 32 位以上随机字符串
COOKIE_PASSWORD=complex_password_at_least_32_characters_long

# 微信支付配置 (required)
WX_APP_ID=你的公众号AppID
WX_MCH_ID=你的商户号
WX_API_V3_KEY=你的APIv3密钥
WX_CERT=你的商户证书内容
WX_KEY=你的商户私钥内容

# 微信 OAuth (JSAPI 必须)
WX_APP_SECRET=你的公众号AppSecret

# Vercel KV (required)
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...

# 管理员账号 (可选，有默认值)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 邮件验证码
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_USER=your_user
EMAIL_PASS=your_pass
EMAIL_FROM=DataStore <noreply@example.com>
EMAIL_TLS_REJECT_UNAUTHORIZED=true
```

**证书格式说明**
- `WX_CERT` 与 `WX_KEY` 通常保存成单行，程序会将 `\n` 还原为换行。

---

## 后台管理

后台入口：`/admin`

- **默认管理员账号**：`admin / admin123`
- 可通过环境变量替换

---

## 支付体系

系统会根据设备与环境自动选择支付类型：

- **JSAPI（微信内）**
- **H5（手机浏览器）**
- **Native（桌面）**

### 支付流程（简化）

1. 前端点击购买 → `POST /api/checkout`
2. 服务端根据 `clientType` 创建订单
3. 前端根据返回类型跳转/弹窗/调起 JSAPI
4. 前端轮询 `GET /api/check-order`
5. 成功后写入购买记录

---

## API 参考

**Auth**
- `POST /api/auth/send-otp`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

**Site Settings**
- `GET /api/site`
- `PUT /api/site`

**Datasets**
- `GET /api/datasets`
- `POST /api/datasets`
- `GET /api/datasets/[id]`
- `PUT /api/datasets/[id]`
- `DELETE /api/datasets/[id]`

**Articles**
- `GET /api/articles`
- `POST /api/articles`
- `GET /api/articles/[id]`
- `DELETE /api/articles/[id]`

**Payment**
- `POST /api/checkout`
- `GET /api/check-order?orderId=...`

**WeChat OAuth**
- `GET /api/wechat/oauth/start`
- `GET /api/wechat/oauth/callback`

**Notify**
- `POST /api/notify/alipay`

---

## 数据与存储结构

- `articles`
- `datasets`
- `users`
- `site_settings`
- `otp:email:*` / `otp:ip:*`

---

## 目录结构

```
components/
lib/
pages/
  api/
  admin/
  dataset/
  article/
styles/
```

---

## 部署到 Vercel

1. 导入项目到 Vercel
2. 配置环境变量
3. 绑定 Vercel KV
4. 部署

---

## 安全与合规

- 密码使用 `bcrypt` 哈希
- 邮箱验证码带频控
- Session 使用 HTTP-only cookie

---

## 常见问题

**1. 标签页标题变成问号？**
- 确保文件为 UTF-8 编码

---

## 已知限制 / TODO

- 未实现 `/api/notify/wechat`
- 支付成功依赖轮询
- 默认数据仅用于演示

---

## License

MIT
