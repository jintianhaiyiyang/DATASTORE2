import { kv } from '@vercel/kv';
import { getOrder, getUserByEmail } from './db';
import { hashKey, normalizeEmail } from './security';
import { LOCK, txKey } from './usdt/store';

// One Redis transaction grants the existing authoritative purchase SET and
// marks the order paid. No read/modify/write race, duplicate side effects, or
// crash window between fulfillment and status. Legacy arrays stay read-only.
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
o.status = 'paid'; o.transactionId = ARGV[1]; o.paidAt = ARGV[2]
local ttl = redis.call('TTL',KEYS[1])
redis.call('SET',KEYS[1],cjson.encode(o))
if o.provider ~= 'usdt' and ttl > 0 then redis.call('EXPIRE',KEYS[1],ttl) end
return 1`;
export async function fulfillOrder(orderId, transactionId, proof = {}) {
  const order = await getOrder(orderId);
  if (!order || !await getUserByEmail(order.email)) throw new Error('Order owner missing');
  const result = await kv.eval(FULFILL, [`order:${orderId}`, `purchases:${hashKey(normalizeEmail(order.email))}`,
    txKey(proof.transferId || '-'), LOCK], [String(transactionId), new Date().toISOString(), proof.lease || '']);
  if (!result) throw new Error('Order fulfillment rejected');
  return result === 1;
}
