# DataStore · 数据小商店

基于 **Next.js 14** 的数字资产交易与内容发布平台：前台展示数据集与文章，后台管理内容与站点外观，集成 **微信支付**（Native / H5 / JSAPI）完成购买解锁，数据持久化使用 **Vercel KV (Redis)**，会话使用 **iron-session**。

> 适用场景：报告、文档、网盘资源等数字商品的在线售卖与图文内容运营。

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
- [系统架构](#系统架构)
- [本地运行](#本地运行)
- [环境变量](#环境变量)
- [账号与权限](#账号与权限)
- [后台管理](#后台管理)
- [支付体系](#支付体系)
- [API 参考](#api-参考)
- [数据与存储](#数据与存储)
- [目录结构](#目录结构)
- [部署到 Vercel](#部署到-vercel)
- [安全说明](#安全说明)
- [常见问题](#常见问题)
- [已知限制与说明](#已知限制与说明)
- [License](#license)

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **数据集市** | 首页浏览 / Fuse.js 模糊搜索 / Tab 筛选；详情页购买后解锁下载链接 |
| **文章内容** | 文章列表与详情（HTML 正文）；后台增删改 |
| **付费解锁** | 登录用户购买；下载链接仅对已购用户、免费资源或管理员返回 |
| **微信支付** | 按设备自动分流：桌面 Native 扫码、手机浏览器 H5、微信内 JSAPI |
| **账号体系** | 邮箱验证码注册（bcrypt 哈希）、密码登录、超级管理员通道 |
| **站点设置** | 站点标题、浏览器标签标题、Logo（URL 或上传）、页脚文案、关于我们（HTML） |
| **订单核验** | 微信异步回调写入购买记录；前端轮询 `check-order` 提升体验 |
| **UI** | 深色风格、响应式布局；站点品牌 SSR 注入，减少首屏闪烁 |

---

## 技术栈

| 类别 | 选用 |
|------|------|
| 框架 | Next.js `14.0.0`（Pages Router）、React `18.2` |
| 存储 | `@vercel/kv`（Redis） |
| 会话 | `iron-session`（Cookie 名：`data_store_session`） |
| 密码 | `bcrypt`（cost factor 12） |
| 支付 | `wechatpay-node-v3`（主路径）；`alipay-sdk` 仅预留异步通知 |
| 搜索 | `fuse.js` |
| 二维码 | `qrcode.react` |
| 邮件 | `nodemailer`（注册验证码） |
| 部署 | 推荐 Vercel + Vercel KV |

**依赖中存在但当前未接入主流程的包**（可忽略或后续扩展）：

- `stripe`：未在业务代码中使用
- `react-markdown`：文章 / 详情当前以 HTML（`dangerouslySetInnerHTML`）渲染
- `jsonwebtoken` + `lib/auth.js`：遗留 JWT 工具，**实际鉴权以 iron-session 为准**
- `alipay-sdk`：仅有 `/api/notify/alipay` 回调处理，**下单接口仅走微信**

---

## 系统架构

```
浏览器
  ├─ 前台页面 (/、/dataset/[id]、/article/[id]、/login)
  ├─ 后台页面 (/admin)
  └─ API Routes (pages/api/*)
        ├─ iron-session 读写 Cookie
        ├─ Vercel KV：articles / datasets / users / site_settings / otp:*
        ├─ 微信支付：下单、查单、回调验签解密
        └─ SMTP：注册验证码
```

运行时数据一律以 **Vercel KV** 为准。仓库内 `data/*.json` 仅为本地示例/历史种子，**线上不会自动从这些 JSON 读业务数据**。

---

## 本地运行

### 环境要求

- Node.js 18+（推荐与 Vercel 默认运行时一致）
- npm
- 可用的 Vercel KV（或兼容 `@vercel/kv` 的 Redis REST 配置）
- 完整联调支付 / 邮件时需对应商户与 SMTP

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env.local`，参见 [环境变量](#环境变量)。

开发环境下若未配置 `COOKIE_PASSWORD`，会话会使用内置开发密钥（**仅本地**，生产会直接抛错）。

### 3. 启动

```bash
npm run dev
```

| 地址 | 说明 |
|------|------|
| http://localhost:3000 | 前台首页 |
| http://localhost:3000/login | 用户登录 / 注册 |
| http://localhost:3000/admin | 管理后台（需管理员） |

### 其他脚本

```bash
npm run build   # 生产构建
npm run start   # 生产启动（需先 build）
```

---

## 环境变量

> 标注 **required** 的项在对应功能启用时必须配置；本地可先跑通页面，支付/邮件会按缺失情况返回错误。

### 站点与会话

```bash
# 站点公网地址（required，支付回调与微信 OAuth 依赖）
# 本地示例；生产填 https://your-domain.com（不要末尾斜杠亦可，代码会规范化）
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# iron-session 加密密钥（required，生产环境至少 32 字符）
COOKIE_PASSWORD=complex_password_at_least_32_characters_long

# 可选：遗留 JWT 密钥；未设置时回退到 COOKIE_PASSWORD
# JWT_SECRET=
```

### Vercel KV（required，业务数据）

在 Vercel 控制台创建 KV 存储后，会得到类似变量（本地可从 Dashboard 复制到 `.env.local`）：

```bash
KV_URL=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
# 部分项目还会有 KV_REST_API_READ_ONLY_TOKEN
```

### 微信支付（购买功能 required）

```bash
WX_APP_ID=公众号或应用 AppID
WX_MCH_ID=商户号
WX_API_V3_KEY=APIv3 密钥（32 位）
WX_CERT=商户 API 证书内容（可把换行写成 \n 的单行）
WX_KEY=商户 API 私钥内容（同上）

# JSAPI（微信内支付）与 OAuth 获取 openid 需要
WX_APP_SECRET=公众号 AppSecret
```

证书说明：`lib/wxpay.js` 会将环境变量中的 `\\n` 还原为真实换行后再交给 SDK。

回调地址由代码拼接为：

```text
{NEXT_PUBLIC_SITE_URL}/api/notify/wechat
```

请在微信商户平台配置可访问的 HTTPS 域名（本地需内网穿透或仅用查单轮询调试）。

### 管理员账号（可选）

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

未配置时使用上述默认值。**上线前务必修改**。

### 邮件验证码（注册 required）

```bash
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_USER=your_user
EMAIL_PASS=your_pass
EMAIL_FROM=DataStore <noreply@example.com>

# 设为 false 可关闭 TLS 证书严格校验（仅调试）
EMAIL_TLS_REJECT_UNAUTHORIZED=true
```

### 支付宝（可选，仅通知接口）

当前 **没有** 支付宝下单入口；若自行扩展下单逻辑，可配置：

```bash
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
```

通知地址：`POST /api/notify/alipay`（验签通过后按 `passback_params` 解锁购买）。

---

## 账号与权限

### 角色

| 角色 | 如何获得 | 能力 |
|------|----------|------|
| **普通用户** | `/login` 注册或邮箱/用户名登录 | 浏览；购买后解锁下载；不可访问后台写操作 |
| **超级管理员** | `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录 | 后台 CMS、站点设置；列表接口直接返回下载链接；**无 email，不能走购买接口** |

管理员 session 字段大致为：`{ username, isAdmin: true, isLoggedIn: true }`（无 `email`）。  
因此 `POST /api/checkout` 会拒绝管理员账号，提示使用普通用户邮箱登录后再购买。

### 注册规则（`/api/auth/send-otp` + `/api/auth/register`）

- 邮箱域名白名单：`gmail.com`、`qq.com`、`outlook.com`、`163.com`、`hotmail.com`、`airlink.us.kg`
- 验证码：6 位数字，session 内有效 **5 分钟**，最多校验 **5 次**
- 发送冷却：同一邮箱 / IP / session **60 秒**（成功发送后才写入 KV 冷却键 `otp:email:*`、`otp:ip:*`）
- 密码至少 **8 位**，存储为 `passwordHash`（bcrypt）
- 注册成功后自动登录，初始 `purchasedIds: []`

### 登录（`/api/auth/login`）

1. 先匹配超级管理员明文密码通道  
2. 再查 KV `users`：支持邮箱或 `username`  
3. 若仍有历史明文 `password` 字段，校验通过后会升级为 `passwordHash` 并清除明文

### 会话

- Cookie：`data_store_session`
- `httpOnly`、`sameSite: lax`；生产环境 `secure: true`
- `GET /api/auth/me`：当前登录态
- `POST /api/auth/logout`：销毁 session

---

## 后台管理

入口：[`/admin`](./pages/admin/index.js)

1. 访问时请求 `/api/auth/me`，仅 `isAdmin === true` 可进入  
2. 非管理员登录会提示权限不足；未登录展示管理员登录表单  

### 三个 Tab

| Tab | 功能 |
|-----|------|
| **数据集** | 发布 / 编辑 / 删除；字段：名称、价格、简述、图文详情（HTML）、网盘/下载链接、标签 |
| **文章** | 发布 / 编辑 / 删除；字段：标题、摘要、内容（HTML）、标签 |
| **站点设置** | 站点标题、标签页标题、Logo（URL 或 ≤200KB 图片转 Data URL）、页脚、关于我们（HTML） |

站点设置写入 KV 后，会通过 `updateSiteSettingsCache` 同步前台 localStorage / 内存缓存，导航栏与首页品牌即时更新。

默认站点文案见 `lib/siteDefaults.js`：

- `siteTitle`: `DATA STORE`
- `pageTitle`: `DataStore - 数据小商店`
- `footerText`: `© 2026 数据小商店 DataStore Inc. | 赋能商业决策`

---

## 支付体系

### 客户端分流（`pages/dataset/[id].js`）

| 环境 | `clientType` | 行为 |
|------|--------------|------|
| 微信内置浏览器 | `jsapi` | 需 OAuth 拿 `openid`，调起 `WeixinJSBridge` |
| 手机浏览器 | `h5` | 跳转微信 `mweb_url` |
| 桌面等 | `native` | 弹窗展示支付二维码（`code_url`） |

### 流程

```text
1. 用户登录后在详情页点击购买
2. POST /api/checkout  { datasetId, clientType }
3. 服务端校验登录与 email、商品与价格，创建微信订单
   - attach 写入 JSON: { datasetId, email }
   - notify_url = {SITE}/api/notify/wechat
4. 前端按 type 跳转 / 调起 JSAPI / 展示二维码
5. 并行两条成功路径：
   a. 微信 POST /api/notify/wechat → 解密 resource → updateUserPurchase
   b. 前端每 2s 轮询 GET /api/check-order?orderId=...（最多约 5 分钟）
      查单 SUCCESS 且 attach.email 与当前用户一致 → updateUserPurchase
6. 页面刷新后 isPaid=true，接口返回 downloadUrl
```

### 业务规则

- **价格为 0**：视为免费，接口直接返回下载链接，**不走** checkout（且 checkout 对免费商品返回 400）
- **最低支付金额**：换算后至少 1 分（`Math.round(price * 100)`）
- **管理员**：列表/详情始终视为已解锁并拿到真实链接
- **订单与用户绑定**：`check-order` 若 attach.email 与当前 session 邮箱不一致返回 403

### 微信 OAuth（JSAPI）

- 开始：`GET /api/wechat/oauth/start?redirect=...`（仅允许同站绝对 URL 或相对路径，防开放重定向）
- 回调：`GET /api/wechat/oauth/callback` 用 `code` 换 `openid`，写入 `session.wechatOpenId`
- 若 checkout 返回 `{ needOauth: true }`，前端会带当前页 redirect 去授权

---

## API 参考

除特别说明外，写操作与购买相关接口依赖 iron-session Cookie。

### 认证 ` /api/auth/*`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/send-otp` | 发送注册验证码；body: `{ email }` |
| `POST` | `/api/auth/register` | 注册；body: `{ email, otp, password }` |
| `POST` | `/api/auth/login` | 登录；body: `{ username, password }`（普通用户 username 填邮箱亦可） |
| `POST` | `/api/auth/logout` | 退出 |
| `GET` | `/api/auth/me` | 当前用户；未登录 `{ isLoggedIn: false }` |

### 站点 ` /api/site`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/api/site` | 公开 | 返回站点设置（与默认值合并） |
| `PUT` | `/api/site` | 管理员 | body: `siteTitle, pageTitle, logoUrl, footerText, aboutContent` |

字段长度限制（服务端）：标题 ≤60、页标题 ≤120、页脚 ≤200、关于我们 ≤5000、Logo 数据 ≤400000 字符。

### 数据集 ` /api/datasets`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/api/datasets` | 公开 | 列表；按登录态隐藏/暴露 `downloadUrl` |
| `POST` | `/api/datasets` | 管理员 | 发布；必填 `name`、`baiduLink` |
| `GET` | `/api/datasets/[id]` | 公开 | 详情（链接权限同上） |
| `PUT` | `/api/datasets/[id]` | 管理员 | 更新字段 |
| `DELETE` | `/api/datasets/[id]` | 管理员 | 删除 |

数据集对象主要字段：

```json
{
  "id": 1700000000000,
  "name": "名称",
  "description": "简述",
  "richContent": "<p>HTML 详情</p>",
  "price": 9.9,
  "currency": "CNY",
  "baiduLink": "https://...",
  "downloadUrl": "https://...",
  "tags": ["标签"],
  "createdAt": "ISO-8601",
  "publisher": "admin 或邮箱"
}
```

未购用户响应中 **不含** 真实 `baiduLink`，`downloadUrl` 为 `null`；`isPaid` 表示当前用户是否可下载（含免费与管理员）。

### 文章 ` /api/articles`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `GET` | `/api/articles` | 公开 | 列表 |
| `POST` | `/api/articles` | 管理员 | 发布；必填 `title`、`content` |
| `GET` | `/api/articles/[id]` | 公开 | 详情 |
| `PUT` | `/api/articles/[id]` | 管理员 | 更新 |
| `DELETE` | `/api/articles/[id]` | 管理员 | 删除 |

### 支付

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| `POST` | `/api/checkout` | 已登录且含 email | body: `{ datasetId, clientType?: "native"\|"h5"\|"jsapi" }` |
| `GET` | `/api/check-order?orderId=` | 已登录 | 查微信订单并可能解锁购买 |

`checkout` 成功响应示例：

- Native：`{ type: "qrcode", codeUrl, outTradeNo }`
- H5：`{ type: "h5", mwebUrl, outTradeNo }`
- JSAPI：`{ type: "jsapi", outTradeNo, payParams: { appId, timeStamp, nonceStr, package, signType, paySign } }`
- 需授权：`401` + `{ needOauth: true, message }`

### 微信 OAuth

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/wechat/oauth/start` | 跳转微信授权 |
| `GET` | `/api/wechat/oauth/callback` | 写 openid 后回跳业务页 |

### 支付回调

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/notify/wechat` | 微信 APIv3 通知；成功响应 `{ code: "SUCCESS" }` |
| `POST` | `/api/notify/alipay` | 支付宝异步通知（扩展用）；成功响应文本 `success` |

---

## 数据与存储

### KV Key

| Key | 类型 | 说明 |
|-----|------|------|
| `articles` | JSON 数组 | 全部文章 |
| `datasets` | JSON 数组 | 全部数据集；**首次 `get` 为非数组时写入演示种子** |
| `users` | JSON 数组 | 用户（仅 `passwordHash`，不落库明文密码） |
| `site_settings` | JSON 对象 | 站点设置 |
| `otp:email:{email}` | 时间戳 | 邮箱发送冷却（TTL 约 60s） |
| `otp:ip:{ip}` | 时间戳 | IP 发送冷却 |

### 用户对象（存储）

```json
{
  "email": "user@example.com",
  "username": "user",
  "passwordHash": "$2b$12$...",
  "purchasedIds": ["1", 1700000000000],
  "createdAt": "ISO-8601"
}
```

`purchasedIds` 比较时统一 `String()`，兼容数字/字符串 id。

### 默认演示数据集

当 KV 中 `datasets` 不存在时，`lib/db.js` 会写入两条示例（价格 `0.01`，网盘为占位链接），之后可在后台编辑删除。

### 本地 `data/` 目录

```text
data/articles.json   # 示例，非运行时主数据源
data/datasets.json
data/users.json
```

生产环境请以 KV 为准；不要依赖这些文件做权威存储。

### 站点设置缓存

- 服务端：`getSiteSettings` 进程内缓存约 **30s**
- 客户端：`localStorage` 键 `datastore_site_settings_v1` + 内存模块缓存；SSR 经 `_app.js` 的 `getInitialProps` 注入

---

## 目录结构

```text
.
├── components/           # 布局与 UI 组件
│   ├── Layout.js         # 导航、页脚、登录态（实际使用）
│   ├── Card.js           # 首页卡片（价格/已购/下载）
│   ├── Navbar.js         # 遗留组件（布局已内联导航）
│   └── SearchBar.js
├── data/                 # 本地示例 JSON（非 KV 主存储）
├── lib/
│   ├── db.js             # KV 读写：文章/数据集/用户/站点
│   ├── session.js        # iron-session 配置与 API 包装
│   ├── withAuth.js       # 登录/管理员守卫（可选封装）
│   ├── wxpay.js          # 微信支付客户端工厂
│   ├── siteDefaults.js   # 默认站点配置
│   ├── useSiteSettings.js# 前台站点设置 Context / 缓存
│   └── auth.js           # 遗留 JWT 工具
├── pages/
│   ├── _app.js           # 全局样式 + 站点设置 SSR
│   ├── index.js          # 首页：搜索、Tab、关于我们
│   ├── login.js          # 登录 / 注册
│   ├── admin/index.js    # 管理后台
│   ├── dataset/[id].js   # 数据集详情与支付
│   ├── article/[id].js   # 文章详情
│   └── api/              # 见上方 API 参考
├── styles/               # CSS Modules + globals
├── next.config.js
├── package.json
├── LICENSE               # Apache License 2.0
└── README.md
```

---

## 部署到 Vercel

1. 将仓库导入 [Vercel](https://vercel.com)
2. 创建并绑定 **Vercel KV**，确认环境变量注入
3. 配置 [环境变量](#环境变量)（至少：`NEXT_PUBLIC_SITE_URL`、`COOKIE_PASSWORD`、KV、支付与邮件）
4. `NEXT_PUBLIC_SITE_URL` 填 **正式 HTTPS 域名**（与微信商户 / 公众号授权域名一致）
5. 在微信侧配置：
   - 支付结果通知 URL：`https://你的域名/api/notify/wechat`
   - JSAPI 时公众号网页授权域名与支付目录
6. 部署后使用**非默认**管理员密码登录 `/admin`，替换演示数据集与站点文案

本地推送到 GitHub 可参考仓库内 `howtogithub.txt` 中的基础命令。

---

## 安全说明

| 项 | 实现 |
|----|------|
| 密码 | bcrypt 哈希；存储层 `sanitizeUserForStorage` 剥离明文 `password` |
| Session | HTTP-only Cookie；生产强制长密钥 |
| 下载链接 | 未购不返回真实 URL，降低接口嗅探泄露 |
| 订单归属 | 查单时校验 `attach.email` 与当前用户 |
| OTP | 邮箱域名白名单 + 频控 + 尝试次数上限 |
| OAuth redirect | 限制同站 URL |
| 后台 | 写接口校验 `session.user.isAdmin` |
| 富文本 | 文章 / 数据集详情 / About 按 HTML 渲染 → **仅信任管理员账号** |

生产建议：

1. 修改 `ADMIN_PASSWORD`，足够强度的 `COOKIE_PASSWORD`
2. 不要将商户私钥、APIv3 密钥提交进 Git
3. 微信回调优先依赖官方通知；轮询为体验增强
4. 若 Logo 使用超大 Base64，注意 KV 体积与 localStorage 配额（前端捕获配额失败后仍保留内存缓存）

---

## 常见问题

**1. 本地启动后页面空白或接口 500？**  
检查 KV 相关环境变量是否配置；`getDatasets` 等失败会打日志并回退默认数据。

**2. 无法注册 / 收不到验证码？**  
- 确认 `EMAIL_*` 配置  
- 邮箱是否在白名单域名内  
- 是否触发 60 秒冷却  

**3. 支付初始化失败？**  
- `NEXT_PUBLIC_SITE_URL`、`WX_*` 是否齐全  
- 证书换行是否正确（`\n`）  
- 管理员账号不能购买，请用普通用户  

**4. 微信内提示需要授权？**  
配置 `WX_APP_SECRET`，完成 OAuth 后 session 中会有 `wechatOpenId`。

**5. 支付成功但下载仍锁？**  
- 确认回调是否到达 `/api/notify/wechat`  
- 或等待前端 `check-order` 轮询成功  
- 确认登录邮箱与下单 `attach.email` 一致  

**6. 浏览器标题变成乱码 / 问号？**  
保证源文件与部署管道为 **UTF-8**；默认 `pageTitle` 在代码中使用 Unicode 转义，避免编码损坏。

**7. 后台保存站点设置后前台未变？**  
刷新页面；设置会写 localStorage 并广播 `site-settings-updated`。仍异常时清站点缓存后重载。

---

## 已知限制与说明

- **支付主路径仅为微信**；支付宝仅有通知处理桩，无前台/checkout 接入
- **Stripe / Markdown 依赖** 已安装但未接入主流程
- **订单无独立 KV 表**：解锁依赖微信 `attach` + 用户 `purchasedIds`，不落本地订单流水
- **免费资源** 对所有人（含未登录）在接口层可直接拿到 `downloadUrl`（`isFree || isPaid || isAdmin`）
- **种子数据集** 仅在 KV 中 `datasets` 非数组时写入一次
- **`lib/withAuth.js`** 提供了可复用守卫，多数路由目前直接使用 `withIronSessionApiRoute` 内联校验
- **`components/Navbar.js`** 为遗留组件，当前布局导航在 `Layout.js` 内实现

---

## License

本项目采用 [Apache License 2.0](./LICENSE)。

```text
Copyright 请以 LICENSE 文件及仓库声明为准

Licensed under the Apache License, Version 2.0
http://www.apache.org/licenses/LICENSE-2.0
```

> 旧版 README 曾误标为 MIT，以仓库根目录 `LICENSE`（Apache-2.0）为准。
