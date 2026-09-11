# DataStore 数据小商店

一个基于 Next.js Pages Router 的数字资源发布与交易应用。它包含公开内容市集、邮箱账号、管理后台、微信支付与付费下载权限控制。

本仓库已完成一轮安全与可维护性重构：移除了默认管理员密码和无效的演示数据，升级到 Next.js 16 / React 19，增加内容净化、限流、CSRF/同源检查、本地订单账本、严格支付校验、测试与 ESLint。全新部署会显示空市集，请先通过后台添加真实内容。

## 功能

- 数据集与文章的浏览、搜索和响应式详情页
- 邮箱验证码注册、bcrypt 密码哈希、加密 Cookie Session
- 管理员发布、编辑、删除文章/数据集和修改站点外观
- 微信 Native、H5、JSAPI 支付
- 免费资源直接下载，付费资源在确认付款后解锁
- 富文本白名单净化，危险脚本、事件属性和 URL 会被移除
- 登录、验证码、下单和查单接口的 Redis 限流
- CSP、HSTS（生产环境）、防点击劫持等安全响应头

## 技术要求

- Node.js 20.9 或更高版本
- npm
- Vercel KV 或兼容的 Upstash Redis REST 存储
- 完整注册功能需要 SMTP
- 完整购买功能需要微信支付 API v3；JSAPI 还需要公众号 OAuth

## 本地启动

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env.local
npm run dev
```

页面入口：

- `http://localhost:3000`：公开市集
- `http://localhost:3000/login`：登录与注册
- `http://localhost:3000/admin`：管理后台

没有 Redis 时，依赖数据的接口会明确失败，不会用空数组或演示记录覆盖远端数据。

## 环境变量

复制 [.env.example](./.env.example) 后填写实际值。不要提交 `.env.local`、证书、私钥或商户密钥。

### 必需基础配置

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
COOKIE_PASSWORD=至少32位随机字符串
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

生产环境的 `NEXT_PUBLIC_SITE_URL` 必须为 HTTPS。可用以下命令生成 Session 密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 管理员

```dotenv
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=use-a-long-unique-password
```

代码中没有默认管理员凭据。未配置这两个变量时，管理员通道保持关闭。

### 邮件注册

```dotenv
EMAIL_HOST=smtp.example.com
EMAIL_PORT=465
EMAIL_USER=...
EMAIL_PASS=...
EMAIL_FROM=DataStore <noreply@example.com>
EMAIL_TLS_REJECT_UNAUTHORIZED=true
ALLOWED_EMAIL_DOMAINS=gmail.com,qq.com,outlook.com,163.com,hotmail.com
```

`ALLOWED_EMAIL_DOMAINS` 是逗号分隔的注册邮箱域名白名单。TLS 证书校验只应在临时本地排错时关闭。

### 微信支付

```dotenv
WX_APP_ID=...
WX_APP_SECRET=...
WX_MCH_ID=...
WX_API_V3_KEY=32字节APIv3密钥
WX_CERT=商户API证书PEM
WX_KEY=商户API私钥PEM
```

只支持单行环境变量的平台可把 PEM 换行写成 `\n`。微信异步通知地址为：

```text
https://你的域名/api/notify/wechat
```

还需在微信商户平台/公众号后台配置支付目录、通知域名和网页授权域名。

## 常用命令

```bash
npm run dev      # 开发服务器
npm run lint     # ESLint，警告也会导致失败
npm test         # Vitest 单元测试
npm run build    # 生产构建
npm run check    # 依次运行 lint、test、build
npm start        # 启动已构建应用
npm audit        # 依赖安全审计
```

## 权限和支付流程

1. 用户通过邮箱验证码注册，密码仅以 bcrypt 哈希保存。
2. 下单接口从服务端读取数据集和价格，客户端不能指定金额。
3. 下单前写入带 TTL 的本地订单：用户、数据集、金额、币种和支付类型。
4. Native 展示二维码；H5 使用 API v3 的 `h5_url` 跳转微信；JSAPI 通过同源 OAuth 获取 `openid` 后使用 SDK 返回的签名参数拉起微信。所有设备都可以选择扫码支付。
5. 微信通知必须使用原始请求体通过平台证书验签；验签失败立即拒绝。
6. 通知或主动查单成功后，仍需逐项匹配本地订单号、金额、币种、AppID 和商户号。
7. 购买记录使用 Redis Set 原子写入，避免并发付款时互相覆盖；旧 `purchasedIds` 会自动合并迁移。

查单接口只能查询当前登录用户自己的本地订单。客户端提供的订单号、回调 `attach` 或解密成功本身都不足以授予下载权限。

### 手机、平板支付与排错

- 普通手机浏览器和 iPad（包括桌面 UA 模式）优先使用 H5；微信内优先使用 JSAPI。无法调起时，点击“显示支付二维码”。Native 也需要商户开通对应支付产品；H5 或 JSAPI 的授权不能替代 Native 权限。
- H5 需要在商户平台开通，并配置与实际访问站点一致的支付域名。JSAPI 需要正确的 `WX_APP_SECRET`、公众号网页授权域名、支付目录与 AppID/商户绑定；授权完成后点击微信支付继续。
- H5 回跳 URL 保留订单号，浏览器拒绝本地存储时也可继续查单。普通待支付记录按用户和资源保存；页面切换会中止旧查询，重新可见或联网后继续确认。
- 改用另一支付方式时，服务端先核对原订单，再关闭仍未付款的订单。原订单已付款、支付中或无法确认关闭时，不会继续创建新订单。请先检查支付结果，避免重复付款。
- 二维码提供扫描留白。手机上可用另一台设备的微信扫码，也可尝试截图后从微信相册识别。关闭二维码窗口只关闭展示，保留支付确认能力。
- 微信内浏览器桥接未就绪时最多等待 8 秒，随后提示改用二维码；不会无限等待。支付取消、断网、查单限流与订单关闭都有明确提示。
- 服务器日志保留受限的支付错误码；浏览器不会收到商户私钥、证书或 APIv3 密钥。

SDK 返回格式参考：[H5](https://github.com/klover2/wechatpay-node-v3-ts/blob/master/docs/transactions_h5.md)、[JSAPI](https://github.com/klover2/wechatpay-node-v3-ts/blob/master/docs/transactions_jsapi.md)。回归测试还直接调用已安装 SDK 的 JSAPI 参数转换流程，以防升级后返回格式再次不兼容。

## 数据结构

主要 Redis Key：

| Key | 用途 |
| --- | --- |
| `articles` | 文章数组 |
| `datasets` | 数据集数组 |
| `users` | 兼容旧版本的用户索引 |
| `user:{emailHash}` | 单个用户记录与邮箱唯一占位 |
| `purchases:{emailHash}` | 原子购买记录 Set |
| `order:{orderId}` | 7 天有效的支付订单 |
| `site_settings` | 站点外观与关于内容 |
| `rate:*` | 登录、验证码、下单、查单限流 |

邮箱在 Redis Key 中使用 SHA-256 摘要，不直接暴露原文。运行时只使用 Redis；仓库不再保留容易误解为真实数据源的 `data/*.json`。

## API 摘要

| 方法与路径 | 权限 | 用途 |
| --- | --- | --- |
| `GET /api/articles` | 公开 | 文章列表 |
| `POST /api/articles` | 管理员 | 发布文章 |
| `GET/PUT/DELETE /api/articles/:id` | 读取公开，写入管理员 | 文章详情与维护 |
| `GET /api/datasets` | 公开 | 按当前权限隐藏/返回下载地址 |
| `POST /api/datasets` | 管理员 | 发布数据集 |
| `GET/PUT/DELETE /api/datasets/:id` | 读取公开，写入管理员 | 数据集详情与维护 |
| `GET/PUT /api/site` | 读取公开，写入管理员 | 站点设置 |
| `POST /api/auth/send-otp` | 公开、限流 | 发送验证码 |
| `POST /api/auth/register` | 公开 | 注册并登录 |
| `POST /api/auth/login` | 公开、限流 | 用户或管理员登录 |
| `POST /api/auth/logout` | 当前 Session | 退出 |
| `POST /api/checkout` | 登录用户、限流 | 创建微信订单 |
| `GET /api/check-order` | 订单所属用户、限流 | 主动确认支付 |
| `POST /api/notify/wechat` | 微信验签 | 异步支付通知 |

浏览器发起的状态修改请求会做同源校验。微信通知是独立的外部入口，使用微信签名校验而非 Session。

## 安全说明

- 富文本会在写入和读取时使用白名单净化，兼容旧的未净化记录。
- 下载地址只向管理员、已购买用户或免费资源访问者返回。
- 生产 Session 必须使用至少 32 位密钥，Cookie 为 `httpOnly`、`secure`、`sameSite=lax`。
- OAuth `state` 使用加密随机数并一次性消费，回跳地址用 URL Origin 精确比较。
- 接口不向客户端回传 Redis、SMTP、支付 SDK 或证书错误详情。
- 内容管理仍采用管理员低频写入的数组模型；如果未来需要多人高并发 CMS，应迁移为独立记录和索引。

## 部署到 Vercel

1. 导入仓库并绑定 Vercel KV/Upstash Redis。
2. 按 `.env.example` 配置 Production 环境变量。
3. 将 `NEXT_PUBLIC_SITE_URL` 设置为正式 HTTPS 域名。
4. 在微信侧配置通知、支付目录和授权域名。
5. 部署后运行一次登录、注册、三种支付类型的沙箱/小额端到端验收。

自动化测试覆盖输入净化、同源/重定向边界、三种下单方式、已安装 SDK 的 JSAPI 返回值、移动端识别、浏览器存储受限、微信桥接就绪/超时/取消、OAuth 回跳、切换支付方式、订单归属、支付金额/商户匹配和购买权限写入失败。支付接口测试使用隔离的 Redis/微信模拟响应，不会发起真实扣款；真实 SMTP、Redis 和微信商户环境仍需部署后的集成测试。

## License

[Apache License 2.0](./LICENSE)
