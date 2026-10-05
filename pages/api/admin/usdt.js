import { kv } from '@vercel/kv';
import { withIronSessionApiRoute } from '../../../lib/session';
import { getSiteSettings, saveSiteSettings, getOrder } from '../../../lib/db';
import { requireSameOrigin } from '../../../lib/security';
import { resolveConfig, VERIFIED_USDT, integer } from '../../../lib/usdt/config';
import { connectRpc } from '../../../lib/usdt/rpc';
import { WATCH, txKey } from '../../../lib/usdt/store';
import { formatUnits } from '../../../lib/usdt/amount';
import { scanPayments } from '../../../lib/usdt/scanner';

function publicConfig(settings, config) {
  return { enabled: settings.enableUsdt === true,
    waitSeconds: integer(settings.usdtCheckoutWaitSeconds, 5, 0, 60),
    address: config?.address || process.env.BSC_PAYMENT_ADDRESS || settings.usdtPaymentAddress || '',
    token: config?.token || process.env.BSC_USDT_CONTRACT || settings.usdtContract || VERIFIED_USDT,
    rate: config?.rate || process.env.USDT_CNY_RATE || settings.usdtCnyRate || '',
    confirmations: config?.confirmations || 20, timeoutMinutes: config?.timeoutMinutes || 15, tailMax: config?.tailMax || 9999,
    rpcConfigured: !!process.env.BSC_RPC_URL, backupConfigured: !!process.env.BSC_RPC_URL_BACKUP,
    envOverrides: ['BSC_PAYMENT_ADDRESS','BSC_USDT_CONTRACT','USDT_CNY_RATE','BSC_CONFIRMATIONS','USDT_PAYMENT_TIMEOUT_MINUTES','USDT_TAIL_MAX'].filter((key) => !!process.env[key]) };
}
async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!req.session.user?.isLoggedIn || !req.session.user.isAdmin) return res.status(403).json({ message: '无权操作' });
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return res.status(405).end();
  if (req.method !== 'GET' && !requireSameOrigin(req, res)) return;
  try {
    const settings = await getSiteSettings();
    let config;
    try { config = resolveConfig(settings); } catch { /* Admin can fix incomplete configuration. */ }
    if (req.method === 'PUT') {
      const b = req.body || {};
      if (typeof b.enabled !== 'boolean') return res.status(400).json({ message: '开关无效' });
      if (b.waitSeconds !== undefined && (!/^\d+$/.test(String(b.waitSeconds)) || Number(b.waitSeconds…479 tokens truncated…日志查询检查通过' });
    }
    const offset = integer(req.query.offset, 0, 0, 1000000);
    const ids = await kv.zrange('usdt:transactions', offset, offset + 49, { rev: true });
    const transactions = await Promise.all(ids.map(async (id) => {
      const tx = await kv.get(txKey(id));
      if (!tx) return null;
      const order = tx.orderId ? await getOrder(tx.orderId) : null;
      const claims = await kv.smembers(`usdt:claims:${id}`);
      const claimDetails = await Promise.all(claims.map(async (orderId) => {
        const claimOrder = await getOrder(orderId);
        if (!claimOrder) return { orderId };
        return { orderId, email: claimOrder.email, expected: formatUnits(claimOrder.expectedAtomic),
          state: BigInt(tx.actualAtomic) < BigInt(claimOrder.expectedAtomic) ? 'underpaid' : 'overpaid',
          excess: BigInt(tx.actualAtomic) > BigInt(claimOrder.expectedAtomic) ? formatUnits(BigInt(tx.actualAtomic) - BigInt(claimOrder.expectedAtomic)) : '0' };
      }));
      return { ...tx, email: order?.email || null, expected: order ? formatUnits(order.expectedAtomic) : null,
        actual: formatUnits(tx.actualAtomic), createdAt: order?.createdAt || null, paidAt: order?.paidAt || null, claims: claimDetails };
    }));
    const watch = await kv.get(WATCH);
    if (watch?.lastSuccessAt && Date.now() - watch.lastSuccessAt > 180000) watch.status = 'stale';
    return res.status(200).json({ config: publicConfig(settings, config), valid: !!config, watch, transactions: transactions.filter(Boolean), offset, hasMore: ids.length === 50 });
  } catch { return res.status(503).json({ message: 'USDT 操作失败，请检查配置、RPC 和 KV 连接' }); }
}
export default withIronSessionApiRoute(handler);
