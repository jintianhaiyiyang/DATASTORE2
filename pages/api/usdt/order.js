import { kv } from '@vercel/kv';
import { withIronSessionApiRoute } from '../../../lib/session';
import { getOrder } from '../../../lib/db';
import { isOrderOwner } from '../../../lib/orderValidation';
import { requireSameOrigin, hashKey } from '../../../lib/security';
import { consumeRateLimit } from '../../../lib/rateLimit';
import { formatUnits, paymentUri } from '../../../lib/usdt/amount';
import { cancelOrder, txKey } from '../../../lib/usdt/store';

export function presentOrder(order, now = Date.now()) {
  return { id: order.id, datasetId: order.datasetId,
    status: order.status === 'pending' && now > order.expiresAt ? 'expired' : order.status,
    amount: formatUnits(order.expectedAtomic), address: order.address, token: order.token,
    baseAmount: formatUnits(order.baseAtomic), cnyPrice: order.cnyPrice, cnyPerUsdt: order.cnyPerUsdt,
    expiresAt: order.expiresAt, serverNow: now, confirmations: order.confirmations || 0,
    requiredConfirmations: order.requiredConfirmations, txHash: order.transactionId || null,
    actualAmount: order.actualAtomic ? formatUnits(order.actualAtomic) : null, uri: paymentUri(order) };
}
async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).end();
  if (req.method !== 'GET' && !requireSameOrigin(req, res)) return;
  if (!req.session.user?.isLoggedIn || !req.session.user.email) return res.status(401).json({ message: '请先登录' });
  const id = req.query.orderId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_*\-]{6,64}$/.test(id)) return res.status(400).json({ message: '订单号无效' });
  try {
    const order = await getOrder(id);
    if (order?.provider !== 'usdt' || !isOrderOwner(order, req.session.user.email)) return res.status(404).json({ message: '订单不存在' });
    const limit = await consumeRateLimit(`rate:usdt:${hashKey(`${order.email}:${id}`)}`, { limit: 90, windowSeconds: 300 });
    if (!limit.allowed) return res.status(429).json({ message: '查询过于频繁，请稍后重试' });
    if (req.method === 'DELETE') {
      if (!await cancelOrder(id)) return res.status(409).json({ message: '订单已支付或正在确认，不能取消' });
      return res.status(200).json({ message: '订单已取消，后续转账需人工处理' });
    }
    if (req.method === 'POST') {
      // A hash is ONLY a lookup hint into independently RPC-verified records.
      // Claims cannot bind a transfer or fulfill an order, even for overpayment.
      const { txHash, logIndex } = req.body || {};
      if (typeof txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(txHash) || !Number.isSafeInteger(logIndex) || logIndex < 0) return res.status(400).json({ message: '交易 Hash 或日志序号无效' });
      const tx = await kv.get(txKey(`${txHash.toLowerCase()}:${logIndex}`));
      if (!tx || tx.status === 'orphaned' || tx.to !== order.address || tx.token !== order.token || (tx.orderId && tx.orderId !== id)) return res.status(404).json({ message: '尚未扫描到可用于此订单的 USDT 交易，请稍后重试' });
      const actual = BigInt(tx.actualAtomic), expected = BigInt(order.expectedAtomic);
      const state = actual < expected ? 'underpaid' : actual > expected ? 'overpaid' : 'review';
      const claim = { orderId: id, transferId: tx.id, state, createdAt: Date.now() };
      await kv.set(`usdt:claim:${id}:${tx.id}`, claim, { nx: true });
      await kv.sadd(`usdt:claims:${tx.id}`, id);
      console.info(JSON.stringify({ event: `USDT payment ${state}`, orderId: id, txHash: tx.txHash, blockNumber: tx.blockNumber }));
      return res.status(200).json({ state, actualAmount: formatUnits(tx.actualAtomic),
        message: `${state === 'underpaid' ? '支付金额不足' : state === 'overpaid' ? '支付金额超过应付金额' : '交易待核对'}。已记录你的查询申请；交易归属需管理员核实，不会自动退款或解锁。` });
    }
    return res.status(200).json(presentOrder(order));
  } catch { return res.status(503).json({ message: '订单查询暂不可用，请稍后重试' }); }
}
export default withIronSessionApiRoute(handler);
