# USDT/BSC implementation and validation record

## Validation performed

- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm test`: 119 passed; the 14 real-Redis tests skip in this generic command because they require the dedicated isolated harness.
- `npm run test:usdt:redis`: all 14 passed against an actual disposable Redis 7 instance, including concurrent Lua execution. Thus **133 distinct automated tests passed** in total.
- `npm run build`: passed. Next.js reports the pre-existing `_app.getInitialProps` automatic-static-optimization warning. The project is JavaScript; there is no standalone TypeScript configuration.
- Additional HTTP smoke test: actual Next.js + `@vercel/kv` REST client backed by local Redis. Homepage, cashier route, authenticated cashier projection (`10.000137`, pending), common order query, non-admin denial and admin endpoint passed. No RPC URL/test KV secret appeared in cashier responses.
- Review: shared atomic fulfillment, permanent reservations, lease fencing, log uniqueness, no frontend-controlled paid transition, settings/secret separation, code diff checked. No real wallet, RPC API key, seed phrase or wallet private key was added. Test fixtures are synthetic.
- **Not verified:** desktop/mobile visual rendering and browser success redirect. Browser automation was attempted, but the environment rejected Chromium's required socket creation with `Operation not permitted`. Responsive CSS and accessible controls are implemented; check them in an unrestricted browser before enabling production payments.
- **Not verified:** a real BSC payment and production RPC/scheduler setup. No real receiving address, RPC credentials or payment funds were provided. The rollout checklist and real-payment steps are in [USDT-BSC.md](USDT-BSC.md).

## Every changed/new file

| File | Change |
| --- | --- |
| `.env.example` | BSC RPC, treasury, verified token, quote, confirmations, timeout, tail and scheduler variables |
| `README.md` | Integration/deployment guide entry |
| `package.json` | Isolated Redis test and supervised scanner-worker commands |
| `lib/db.js` | Remove non-atomic markOrderPaid helper, retain existing data model and purchase reads |
| `lib/fulfillOrder.js` | Shared atomic order completion and existing purchase-SET grant for all providers |
| `lib/paymentConfig.js` | USDT availability and opt-in provider switch |
| `lib/siteDefaults.js` | Default USDT off |
| `lib/siteSettings.js` | Validate new provider enable switch |
| `lib/usdt/amount.js` | Exact bigint parsing, quotes, formatting and ERC-681 URI |
| `lib/usdt/config.js` | Verified contract allowlist and server-only validated configuration |
| `lib/usdt/rpc.js` | Read-only JSON-RPC, chain/token checks, provider fallback, strict Transfer parsing |
| `lib/usdt/store.js` | Durable Redis reservations, counters, events, cursor, fencing, cancellation and expiry |
| `lib/usdt/scanner.js` | Range replay, receipts, confirmation/reorg handling, recovery and common fulfillment |
| `pages/api/checkout.js` | USDT invoice creation, safe provider switching, common completion |
| `pages/api/check-order.js` | USDT status support; common completion for other providers |
| `pages/api/notify/alipay.js` | Existing verified Alipay success → common completion |
| `pages/api/notify/wechat.js` | Existing verified WeChat success → common completion |
| `pages/api/site.js` | Nonsecret USDT availability indication |
| `pages/api/usdt/order.js` | Owner-only cashier projection, cancellation and non-authoritative mismatch query |
| `pages/api/usdt/scan.js` | Cron-secret-protected bounded compensation scan |
| `pages/api/admin/usdt.js` | Admin configuration, RPC health, scan and paginated transaction history |
| `pages/pay/usdt.js` | Independent polling cashier, QR, copy, countdown, network warning, success redirect |
| `pages/admin/index.js` | USDT management tab |
| `components/PaymentPanel.js` | USDT choice, pending cashier resume, existing payment flow integration |
| `components/UsdtAdmin.js` | Configuration, health and transaction/mismatch table |
| `styles/Usdt.module.css` | Existing design tokens with desktop/mobile layouts |
| `scripts/usdt-worker.mjs` | Supervised HTTP scanner loop without wallet keys |
| `scripts/test-usdt-redis.mjs` | Disposable random-port Redis test runner |
| `tests/helpers/redis.js` | Real Redis CLI adapter for tests only |
| `tests/usdt.test.js` | Money, identity, wrong token/network, fallback and RPC error tests |
| `tests/usdt.api.test.js` | Authentication, ownership, forged paid request, claim and admin/cron tests |
| `tests/usdt.redis.test.js` | Real database races, dedup, duplicate transfers, reorgs, expiry and crash recovery |
| `tests/alipay.test.js` | Existing signed-notification regression adapted to common completion |
| `tests/alipay.checkout.test.js` | Existing Alipay checkout/query regressions adapted to common completion |
| `tests/payments.integration.test.js` | Existing WeChat/checkout regressions adapted to common completion |
| `tests/siteSettings.test.js` | Existing availability tests include disabled-by-default USDT |
| `docs/USDT-BSC.md` | Data model, tradeoffs, deployment, security and small real-payment test |
| `docs/USDT-BSC-CHANGES.md` | This complete manifest and verification record |
