# DATASTORE2 USDT (BEP-20 / BNB Smart Chain)

## What is implemented

The USDT purchase button immediately opens a countdown dialog while the server prepares the order. Admin → USDT settings → “收银台打开前倒计时” controls the minimum display time (0–60 seconds, default 5), independently of the payment expiry. The cashier opens only after the server returns a valid invoice and the countdown completes. A scanner-recovery response that guarantees no new invoice has been created can be retried twice with a 30-second countdown; ambiguous network failures are never automatically retried. Cancelling aborts waiting; an already-created order remains available to resume. Copying the wallet or amount shows a short success toast only after the Clipboard API succeeds; errors retain a manual-copy instruction. Dialogs support keyboard focus, reduced-motion preferences and mobile viewport limits.

Non-custodial receipt of Binance-Peg USDT on BSC mainnet, chain ID **56**, with no application commission. Every payment goes directly to the configured public wallet. This integration cannot sign transfers, withdraw, sweep or refund. A compromised application can change future payment instructions, but cannot spend existing treasury funds using the configuration here; keep wallet keys completely outside this server. Gas and exchange withdrawal fees still apply to the sender.

Existing architecture: Next.js 16 Pages Router + React 19 + JavaScript, `@vercel/kv` Redis, iron-session, qrcode.react, CSS modules. No SQL migrations or new UI/chain SDK dependencies. `eth_getLogs`, transaction receipts and canonical block headers provide chain evidence; BscScan is only an outbound transaction link.

The configured contract must equal `0x55d398326f99059ff775485246999027b3197955`. Verified on 2026-10-05 against BNB Chain's asset mapping at <https://explorer.bnbchain.org/asset/USDT-6D8>, with 18 decimals corroborated by the BNB Chain SDK token table <https://github.com/bnb-chain/mpp-sdk> and verified contract <https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955>. This is **Binance-Peg USDT**, also displayed as Binance-Peg BSC-USD, not native Tether issuance on BSC. The single source of the allowlist is `lib/usdt/config.js`; deployment must explicitly supply the contract through env or admin settings. Each RPC is checked for chain 56 and `decimals() = 18`. Do not replace it with a testnet or lookalike token.

## Deployment (required)

1. Deploy the branch with the existing KV, session, site, Alipay and WeChat configuration intact. Back up Redis before deployment. Do not evict/delete `usdt:*`, USDT `order:*`, or purchase SETs; accounting and amount reservations have **no TTL**. Redis must support EVAL and atomic scripts and must be durable. No initial migration is required; new keys initialize lazily.
2. Set **BSC_RPC_URL**, preferably **BSC_RPC_URL_BACKUP**, and a random **CRON_SECRET** of at least 32 characters. RPC URLs must use HTTPS, support `eth_getLogs`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_chainId`, and `eth_call`, and allow at least 200-block log queries. Some public BSC RPCs disable logs; the health check rejects those. Do not put API keys in NEXT_PUBLIC variables, source code or the admin browser.
3. Set **BSC_PAYMENT_ADDRESS**, **BSC_USDT_CONTRACT**, and **USDT_CNY_RATE** (CNY per 1 USDT). These nonsecret fields can alternatively be configured in 后台 → USDT 交易与设置. Environment values take priority. The existing goods are priced in CNY: a required, explicit administrator quote avoids treating 10 CNY as 10 USDT. It is not an FX market feed. Existing invoices retain their quote.
4. Optional settings: **BSC_CONFIRMATIONS=20** (minimum 3), **USDT_PAYMENT_TIMEOUT_MINUTES=15**, **USDT_TAIL_MAX=9999**. Env overrides apply before admin values. Raising confirmations applies to observed payments; lowering never reduces an invoice's recorded minimum.
5. **Install a real recurring scheduler before enabling payments.** Use one of:
   - On an always-on host, export NEXT_PUBLIC_SITE_URL and CRON_SECRET and supervise `npm run usdt:worker` with systemd/your process manager. It calls the scanner about every 20 seconds after the previous invocation completes; it uses only the HTTP bearer secret, not wallet keys.
   - Configure an authenticated external scheduler to POST `/api/usdt/scan` at least every minute, with `Authorization: Bearer <CRON_SECRET>`.
   - If your hosting plan supports minute-level Vercel Cron, merge `{"crons":[{"path":"/api/usdt/scan","schedule":"* * * * *"}]}` into your deployment's vercel.json and set CRON_SECRET. Check your plan's scheduling and execution limits. This repository does not impose a paid cron plan or silently add deployment-wide schedules.
6. Run “检查 RPC 连接”, then “执行一次补偿扫描”. Enable USDT and refresh the storefront. The scanner runs even if payment creation is disabled, so existing invoices continue to settle. Before creating an invoice, stale or missing current-payment coverage triggers a bounded recovery scan using the same global 30-second gate as cashier polling. Each scan prioritizes the latest 200 blocks, then continues the separate historical checkpoint. Invoices require successful current coverage within 3 minutes and at most 400 blocks behind the head; a historical backlog does not block new invoices once current coverage is healthy. The historical cursor is never jumped forward to achieve this. Monitor both checkpoints, last success/error and backlog; request-triggered scanning still requires a persistent scheduler to cover closed cashiers and reconcile old transfers.

Both scan GET and POST require the cron bearer secret; the admin-only API can also invoke a scan. Authenticated owners polling an unpaid cashier can trigger a recovery scan, globally limited by Redis SET NX EX to once per 30 seconds across all users and instances. The scanner's fenced lease prevents overlap with scheduled scans. Paid/cancelled orders and orders expired more than 24 hours ago do not trigger this fallback. RPC failures leave status readable and are retried on a later poll. This fallback does not replace the persistent scheduler: closed cashiers, late transfers and audit records still need scheduled scanning. Configure a 60-second function allowance for both the order query and scanner; each run uses bounded ranges, resumes its checkpoint and renews a fenced Redis lease. A killed process may leave a lease for up to 60 seconds; subsequent scans recover.

## Amounts, order states and deliberate limitations

CNY is converted with integer arithmetic, rounded **up** to six USDT decimal places, then a durable monotonic micro-USDT tail is added. A Redis script creates the invoice and globally reserves its exact 18-decimal atomic amount together. Races and overlapping quote ranges cannot allocate the same atomic amount twice. The default maximum surcharge is 0.009999 USDT, visibly included in the cashier quote.

**Tails are never automatically recycled**, including after cancellation, expiry or payment. A fixed shared address plus recycled amounts cannot distinguish an arbitrarily late or duplicate historical payment from a new customer's payment. Exhaustion stops new invoices at that base quote; it does not reuse identifiers. Increase the tail ceiling within the documented range if commercially acceptable, or migrate receiving addresses with an explicit historical reconciliation plan. Do not simply delete reservations or counters. After a watch is initialized, live wallet/contract rotation is intentionally rejected. Wallet migration is not implemented by this change; continue scanning the old wallet separately until all outstanding payments and audit retention needs are resolved.

- `pending`: reserved amount awaiting a transfer.
- `confirming`: matching Transfer observed; receipt and canonical block hash rechecked before fulfillment, and at least the configured confirmations awaited.
- `paid`: same atomic order/purchase-SET operation as verified Alipay and WeChat payments.
- `expired`: timeout, but late discovery can still settle a transfer **included in a block during the original validity period**. A broadcast time cannot be proven by RPC receipts. A transaction broadcast before expiry but first included after expiry is retained for manual review.
- `invalid`: customer cancelled. Amount remains reserved, later receipts remain recorded and never automatically fulfill.
- Transfers have separate lifecycle (`confirming`, `confirmed`, `orphaned`) and classification (`exact`, `unmatched`, `duplicate`, `late`, `cancelled`, `predates_order`). Duplicate/late transfers never repeat fulfillment.
- Wrong amounts are preserved as `unmatched`. **An incoming 10 or 10.5 USDT does not identify which customer/order paid.** The customer can submit a Hash and logIndex as a query hint; only an independently scanned token receipt can generate an `underpaid`/`overpaid` review claim. Claims show expected, received and excess amounts in the admin table, but are not evidence of ownership and cannot unlock anything. An exact transfer cannot be claimed by another order. No nearest-amount heuristic, automatic top-up aggregation, automatic overpayment fulfillment, refund or admin “trust this hash as paid” API exists. Use independent customer/payment evidence to resolve exceptional payments operationally.
- Ordinary BNB, other BEP-20 tokens and other chains are ignored for payment. Only positive Transfer logs of the allowlisted contract to the configured address are accounting records. Sending assets on a different chain cannot be discovered by this BSC scanner.

QR uses ERC-681 `ethereum:<token>@56/transfer?address=<recipient>&uint256=<atomicAmount>` per <https://eips.ethereum.org/EIPS/eip-681>. Users can select plain-address QR if their wallet does not support payment URIs. QR never requires MetaMask or a connected browser wallet. Some exchanges cannot send six decimal places or subtract withdrawal fees; those payers need a wallet/channel capable of the **exact final received amount**.

## Redis accounting and recovery

| Key | Meaning |
| --- | --- |
| `order:<id>` | Existing order key; USDT keeps immutable quote, wallet, token, time window, minimum inclusion block and confirmation snapshot; no expiry |
| `purchases:<email hash>` | Existing authoritative resource entitlement SET; shared across all three payment methods |
| `usdt:sequence:<token>:<address>:<base micros>` | Permanent monotonic amount tail counter |
| `usdt:amount:<token>:<address>:<atomic amount>` | Permanent one-amount-to-one-order reservation |
| `usdt:orders`, `usdt:open` | Durable invoice index and pending-expiry queue |
| `usdt:tx:<hash>:<logIndex>` | Unique persisted Transfer event, actual amount, sender, canonical block evidence |
| `usdt:transactions`, `usdt:unconfirmed` | Admin history and restart-safe confirmation/fulfillment queue |
| `usdt:watch` | Wallet/token binding, start block, cursor/hash, RPC failover index, health timestamps |
| `usdt:scanner:lock` | 60-second renewable token lease; every scanner mutation is fenced |
| `usdt:claim:<order>:<transfer>`, `usdt:claims:<transfer>` | Non-authoritative mismatch queries; never part of fulfillment |

The first scan starts 128 blocks behind the initialization head. Each invocation scans the latest 200 blocks first and records `lastLiveScannedBlock`, `lastLiveScannedHash` and `lastLiveSuccessAt`; older watches migrate naturally on their next successful scan. The separate historical cursor replays 128 blocks and advances only after persisting every log in each successful range. Long outages therefore do not hold current payments behind thousands of old blocks, while historical transactions remain discoverable through the durable cursor. Receipt, success status, log identity, contract, destination, amount, block hash and timestamp are verified again before finalization. Missing/reorged unconfirmed receipts are orphaned, and orders can be matched by a later canonical transfer. A crash after persisting `confirmed` but before fulfillment leaves the durable queue entry to retry. The fulfillment script atomically SADDs the existing entitlement and changes the order to paid; a repeated invocation makes no changes to paidAt or the original transaction.

RPC results are a trust boundary: use trusted independent providers or your own BSC node. This is not a consensus light client or multi-provider quorum. Confirmation depth reduces ordinary reorg risk, not arbitrary deep consensus rollback. If a previously confirmed transaction reappears at a different block, scanning fails closed for operator investigation; fulfilled resources cannot be automatically revoked. Monitor prolonged errors and reconcile rare deep reorganizations manually.

## Small real mainnet test (operator executes the transfer)

1. Keep existing payment methods enabled. Configure **your own public BSC wallet address**, the verified contract, a valid CNY/USDT quote, mainnet RPCs and the running scheduler. Never paste private keys here.
2. Create a low-price test dataset. Choose an amount above the sending wallet/exchange minimum; a self-custody wallet can often test around 0.1–1 USDT with separate BNB for gas, whereas exchange withdrawal minimums vary. Do not assume the quoted exchange fee is included in the required arrival amount.
3. Buy from a normal user account, choose USDT, verify the complete address, **BEP-20/BSC**, token and six-decimal amount. Record order ID. Send exactly the displayed received amount once, before the timer expires.
4. Confirm the balance arrives directly in your own wallet. Observe pending → confirming → paid. After confirmations, the page should visibly show success and redirect to the existing dataset page with download access. Check admin Hash, logIndex, received amount and block details against BscScan.
5. Re-run compensation scanning several times and reload the cashier. The first transaction/paidAt must not change and the purchase SET must contain the dataset once. Never send a second real payment just to test idempotence; the automated suite covers repeats.
6. Optional tiny wrong-amount tests create review records and **do not refund automatically**. Keep a screenshot/order ID and submit Hash + logIndex; verify the admin mismatch claim. Do not test wrong networks with real funds.

No real wallet/RPC credentials were supplied for this implementation. Automated tests use a disposable actual Redis plus deterministic RPC fixtures; they do not move mainnet funds. Production RPC availability, the deployed scheduler and one real payment must still be verified during rollout.

## Checks

- `npm run lint`
- `npm test` (existing payment regressions plus USDT units/API trust boundaries; real-Redis suite explicitly skips without its isolated harness)
- `npm run test:usdt:redis` (requires redis-server and redis-cli; starts disposable random-port Redis and tests real EVAL scripts, races, dedup, confirmations, expiry, reorg, RPC outages and process-crash recovery)
- `npm run build` (this repository is JavaScript; there is no separate TypeScript project)

Optional `REDIS_SERVER_BINARY` and `REDIS_CLI_BINARY` can select installed binary paths for the Redis harness. It must never point at production data. All financial amounts and EVM values are decimal strings/bigints outside Lua; Lua does not convert token amounts to floating point.
