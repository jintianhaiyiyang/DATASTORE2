import { kv } from '@vercel/kv';
import { randomUUID } from 'node:crypto';
import { quoteMicros } from './amount';
import { scanReady } from './readiness';

export const WATCH = 'usdt:watch';
export const LOCK = 'usdt:scanner:lock';
export const txKey = (id) => `usdt:tx:${id}`;
export const amountKey = (config, amount) => `usdt:amount:${config.token}:${config.address}:${amount}`;
export const FENCE = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return redis.error_reply('SCANNER_LEASE_LOST') end\n`;
export const RESERVE = `
local watch = cjson.decode(redis.call('GET', KEYS[1]) or '{}')
local o = cjson.decode(ARGV[1])
if watch.address ~= o.address or watch.token ~= o.token then return -1 end
if redis.call('EXISTS', KEYS[2]) == 1 or redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
redis.call('SET', KEYS[2], o.id)
redis.call('SET', KEYS[3], ARGV[1])
redis.call('ZADD', KEYS[4], o.expiresAt, o.id)
redis.call('ZADD', KEYS[5], o.createdMs, o.id)
return 1`;

export async function ensureWatch(config, head) {
  await kv.set(WATCH, { address: config.address, token: config.token, startBlock: Math.max(0, head.number - 128),
    lastScannedBlock: Math.max(0, head.number - 129), lastScannedHash: null }, { nx: true });
  const watch = await kv.get(WATCH);
  if (watch.address !== config.address || watch.token !== config.token) throw new Error('USDT watch configuration changed; migration required');
  return watch;
}
export async function reserveOrder(input, config, head, now = Date.now()) {
  const watch = await ensureWatch(config, head);
  // Refuse new invoices if the durable worker is not running or is behind.
  if (!scanReady(watch, head, now)) throw new Error('USDT scanner not ready');
  const base = quoteMicros(input.cnyPrice, config.rate);
  for (let attempt = 0; attempt < 128; attempt++) {
    // Never recycle tails: an arbitrarily late/duplicate payment is otherwise
    // indistinguishable from a new payer. INCR is durable; holes are harmless.
    const tail = await kv.incr(`usdt:sequence:${config.token}:${config.address}:${base}`);
    if (tail > config.tailMax) throw new Error('USDT amount space exhausted');
    const expectedAtomic = ((base + BigInt(tail)) * 1000000000000n).toString();
    const order = { ...input, provider: 'usdt', currency: 'USDT', status: 'pending', chainId: 56, minimumBlock: head.number + 1,
      address: config.address, token: config.token, expectedAtomic, baseAtomic: (base * 1000000000000n).toString(),
      cnyPerUsdt: config.rate, requiredConfirmations: config.confirmations, confirmations: 0,
      createdMs: now, createdAt: new Date(now).toISOString(), expiresAt: now + config.timeoutMinutes * 60000 };
    const result = await kv.eval(RESERVE, [WATCH, amountKey(config, expectedAtomic), `order:${order.id}`, 'usdt:open', 'usdt:orders'], [JSON.stringify(order)]);
    if (result === 1) return order;
    if (result === -1) throw new Error('USDT watch changed');
  }
  throw new Error('USDT amount allocation busy');
}

export async function acquireLease() {
  const token = randomUUID();
  return await kv.set(LOCK, token, { nx: true, ex: 60 }) ? token : null;
}
export async function renewLease(token) {
  await kv.eval(FENCE + `return redis.call('EXPIRE', KEYS[1], 60)`, [LOCK], [token]);
}
export async function releaseLease(token) {
  await kv.eval(`if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`, [LOCK], [token]);
}
export async function saveWatch(token, watch) {
  await kv.eval(FENCE + `redis.call('SET',KEYS[2],ARGV[2]); return 1`, [LOCK, WATCH], [token, JSON.stringify(watch)]);
}

export const RECORD = FENCE + `
local tx = cjson.decode(ARGV[2])
local old = redis.call('GET',KEYS[2])
if old then
  local previous = cjson.decode(old)
  if previous.status == 'confirmed' then
    if previous.blockHash ~= tx.blockHash then return redis.error_reply('CONFIRMED_REORG') end
    return 0
  end
  tx.discoveredAt = previous.discoveredAt
end
redis.call('SET',KEYS[2],cjson.encode(tx))
redis.call('ZADD',KEYS[3],tx.discoveredAt,tx.id)
redis.call('ZADD',KEYS[4],tx.blockNumber,tx.id)
if tx.orderId and tx.orderId ~= cjson.null then
  local raw = redis.call('GET',KEYS[5])
  if raw then
    local o = cjson.decode(raw)
    if o.status ~= 'paid' and not o.cancelledAt and tx.classification == 'exact' then
      o.requiredConfirmations = math.max(o.requiredConfirmations, tx.requiredConfirmations or 0)
      o.status = 'confirming'; o.transactionId = tx.txHash; o.transferId = tx.id
      o.payer = tx.from; o.actualAtomic = tx.actualAtomic; o.firstBlock = tx.blockNumber; o.confirmations = tx.confirmations
      redis.call('SET',KEYS[5],cjson.encode(o))
    end
  end
end
return 1`;
export async function recordTransfer(token, tx) {
  return kv.eval(RECORD, [LOCK, txKey(tx.id), 'usdt:transactions', 'usdt:unconfirmed', `order:${tx.orderId || '-'}`], [token, JSON.stringify(tx)]);
}
export async function updateTransfer(token, tx) {
  await kv.eval(FENCE + `redis.call('SET',KEYS[2],ARGV[2]); return 1`, [LOCK, txKey(tx.id)], [token, JSON.stringify(tx)]);
}
export async function finishTransfer(token, id) {
  await kv.eval(FENCE + `redis.call('ZREM',KEYS[2],ARGV[2]); return 1`, [LOCK, 'usdt:unconfirmed'], [token, id]);
}
export async function orphanTransfer(token, tx, now = Date.now()) {
  await kv.eval(FENCE + `
local raw = redis.call('GET',KEYS[3])
if raw then
 local o = cjson.decode(raw)
 if o.status == 'paid' and o.transferId == ARGV[3] then return redis.error_reply('PAID_REORG') end
 if o.transferId == ARGV[3] then
  o.status = tonumber(ARGV[4]) > o.expiresAt and 'expired' or 'pending'
  if o.status == 'pending' then redis.call('ZADD',KEYS[5],o.expiresAt,o.id) end
  o.confirmations = 0; o.transferId = nil; o.transactionId = nil
  o.actualAtomic = nil; o.payer = nil; o.firstBlock = nil
  redis.call('SET',KEYS[3],cjson.encode(o))
 end
end
redis.call('SET',KEYS[2],ARGV[2]); redis.call('ZREM',KEYS[4],ARGV[3]); return 1`,
  [LOCK, txKey(tx.id), `order:${tx.orderId || '-'}`, 'usdt:unconfirmed', 'usdt:open'], [token, JSON.stringify({ ...tx, status: 'orphaned', confirmations: 0 }), tx.id, now]);
}
export async function expireOrders(token, now) {
  const ids = await kv.zrange('usdt:open', 0, now, { byScore: true, offset: 0, count: 200 });
  for (const id of ids) await kv.eval(FENCE + `
local raw = redis.call('GET',KEYS[2]); if not raw then return 0 end
local o = cjson.decode(raw)
if o.status == 'pending' then o.status = 'expired'; redis.call('SET',KEYS[2],cjson.encode(o)) end
redis.call('ZREM',KEYS[3],ARGV[2]); return 1`, [LOCK, `order:${id}`, 'usdt:open'], [token, id]);
}
export async function cancelOrder(id) {
  return kv.eval(`
local raw = redis.call('GET',KEYS[1]); if not raw then return 0 end
local o = cjson.decode(raw)
if o.provider ~= 'usdt' or o.status == 'paid' or o.status == 'confirming' then return 0 end
if not o.cancelledAt then o.cancelledAt = tonumber(ARGV[1]) end
o.status = 'invalid'; redis.call('SET',KEYS[1],cjson.encode(o)); redis.call('ZREM',KEYS[2],o.id); return 1`, [`order:${id}`, 'usdt:open'], [Date.now()]);
}
