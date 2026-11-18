import { kv } from '@vercel/kv';
import { getDatasets, getOrder, getUserByEmail } from './db';
import { deliveriesKey, isStockMode, ownerHash, pendingKey, stockKey } from './digital';
import { PAID_ORDERS, userOrdersKey } from './orders';
import { hashKey, normalizeEmail } from './security';
import { LOCK, txKey } from './usdt/store';

// One Redis transaction grants the existing authoritative purchase SET and
// marks the order paid. No read/modify/write race, duplicate side effects, or
// crash window between fulfillment and status. Legacy arrays stay read-only.
// Stock-mode digital goods pop exactly one item in the same transaction; if
// the stock ran out the paid order queues for the next restock.
// Paid orders are kept permanently (no TTL) as the sales ledger and indexed
// for the admin order list and the buyer's "我的订单" page.
export const FULFILL = `
local raw = redis.call('GET',KEYS[1]); if not raw then return 0 end
local o = cjson.decode(raw)
if o.status == 'paid' then return 2 end
if o.provider == 'usdt' then
 if redis.call('GET',KEYS[4]) ~= ARGV[3] then return redis.error_reply('SCANNER_LEASE_LOST') end
 local r = redis.call('GET',KEYS[3]); if not r then return 0 end
 local t = cjson.decode(r)
 if t.status ~= 'confirmed' or t.classification ~= 'exact' or t.orderId ~= o.id or
    t.actualAtomic ~= o.expectedAtomic or t.to ~= o.address or t.token ~= o.token or
    t.txHash ~= ARGV[1] or t.confirmations < o.requiredConfirmations or
    (t.blockTime < math.floor(o.createdMs / 1000) or t.blockNumber < o.minimumBlock) or t.blockTime * 1000 > o.expiresAt or o.cancelledAt then return 0 end
 o.transferId = t.id; o.actualAtomic = t.actualAtomic; o.payer = t.from
 o.firstBlock = t.blockNumber; o.confirmations = t.confirmations
end
redis.call('SADD',KEYS[2],o.datasetId)
if ARGV[4] == 'stock' then
 local entry = {orderId=o.id, paidAt=ARGV[2]}
 local raw = redis.call('LPOP',KEYS[5])
 if raw then
  local ok, item = pcall(cjson.decode, raw); if not ok or type(item) ~= 'string' then item = raw end
  entry.item = item; entry.deliveredAt = ARGV[2]; o.deliveryStatus = 'delivered'
 else
  entry.pending = true; o.deliveryStatus = 'pending'
  redis.call('RPUSH',KEYS[6],o.id .. '|' .. ARGV[5])
 end
 redis.call('HSET',KEYS[7],o.id,cjson.encode(entry))
end
o.status = 'paid'; o.transactionId = ARGV[1]; o.paidAt = ARGV[2]
if ARGV[6] ~= '' and not o.productName then o.productName = ARGV[6] end
redis.call('SET',KEYS[1],cjson.encode(o))
redis.call('ZADD',KEYS[8],ARGV[7],o.id)
redis.call('ZADD',KEYS[9],ARGV[7],o.id)
return 1`;
export async function fulfillOrder(orderId, transactionId, proof = {}) {
  const order = await getOrder(orderId);
  if (!order || !await getUserByEmail(order.email)) throw new Error('Order owner missing');
  const datasetId = String(order.datasetId);
  const product = order.status === 'paid' ? null : (await getDatasets()).find((d) => String(d.id) === datasetId);
  const owner = ownerHash(order.email);
  const now = Date.now();
  const result = await kv.eval(FULFILL, [`order:${orderId}`, `purchases:${hashKey(normalizeEmail(order.email))}`,
    txKey(proof.transferId || '-'), LOCK, stockKey(datasetId), pendingKey(datasetId), deliveriesKey(owner, datasetId),
    PAID_ORDERS, userOrdersKey(owner)],
  [String(transactionId), new Date(now).toISOString(), proof.lease || '', isStockMode(product) ? 'stock' : '', owner,
    product?.name || '', String(now)]);
  if (!result) throw new Error('Order fulfillment rejected');
  return result === 1;
}
