import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@vercel/kv', async () => ({ kv: (await import('./helpers/redis')).redis }));
import { command, redis } from './helpers/redis';
import { reserveOrder, WATCH, amountKey, txKey, cancelOrder, LOCK, recordTransfer } from '../lib/usdt/store';
import { scanPayments } from '../lib/usdt/scanner';
import { fulfillOrder, FULFILL } from '../lib/fulfillOrder';
import { getOrder, getPurchasedIds, saveOrder } from '../lib/db';
import { hashKey } from '../lib/security';
import { VERIFIED_USDT } from '../lib/usdt/config';
import { TRANSFER_TOPIC, topicAddress, hex } from '../lib/usdt/rpc';
import { units } from '../lib/usdt/amount';
const suite = process.env.REDIS_TEST_PORT ? describe : describe.skip;
const BASE = 1700000000000;
const address = `0x${'1'.repeat(40)}`, sender = `0x${'2'.repeat(40)}`, email = 'buyer@example.test';
const hash = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const config = { address, token: VERIFIED_USDT, rate: '7', confirmations: 20, timeoutMinutes: 15, tailMax: 9999, urls: ['https://fake.test'] };
let head, events, receipts, clock, failLogs;
function block(n) { return { number: hex(n), timestamp: hex(BASE / 1000 + n), hash: hash(n + 10000) }; }
async function connect() {
  return { head: { number: head, timestamp: BASE / 1000 + head, hash: hash(head + 10000) }, providerIndex: 0,
    call: async (method, args) => {
      if (method === 'eth_getBlockByNumber') return block(Number(BigInt(args[0])));
      if (method === 'eth_getLogs') {
        if (failLogs) throw new Error('temporary RPC failure');
        return events.filter((e) => Number(BigInt(e.blockNumber)) >= Number(BigInt(args[0].fromBlock)) && Number(BigInt(e.blockNumber)) <= Number(BigInt(args[0].toBlock)));
      }
      if (method === 'eth_getTransactionReceipt') return receipts.get(args[0]) || null;
      throw new Error(`Unexpected RPC method ${method}`);
    } };
}
const scan = (overrides = {}) => scanPayments({ config: { ...config, ...overrides }, connect, now: () => clock });
async function invoice(id = 'ORDER_usdt0001', overrides = {}) {
  return reserveOrder({ id, email, datasetId: 'resource1', cnyPrice: '70' }, { ...config, ...overrides }, { number: head }, clock);
}
function transfer(amount, n = 101, tx = 1, token = VERIFIED_USDT) {
  const entry = { address: token, topics: [TRANSFER_TOPIC, topicAddress(sender), topicAddress(address)], data: hash(BigInt(amount)),
    transactionHash: hash(tx), blockHash: block(n).hash, blockNumber: hex(n), logIndex: '0x0' };
  events.push(entry);
  receipts.set(entry.transactionHash, { transactionHash: entry.transactionHash, status: '0x1', blockNumber: entry.blockNumber, blockHash: entry.blockHash, logs: [entry] });
  return `${entry.transactionHash}:0`;
}
suite('real Redis + RPC scanner integration', () => {
  beforeEach(async () => {
    await command('FLUSHDB'); // This suite runs only on a disposable random-port Redis.
    head = 100; events = []; receipts = new Map(); clock = BASE + 100000; failLogs = false;
    await redis.set(`user:${hashKey(email)}`, { email, purchasedIds: [] });
    await scan();
  });
  it('allocates 40 concurrent, globally unique six-decimal amounts atomically', async () => {
    const orders = await Promise.all(Array.from({ length: 40 }, (_, n) => invoice(`ORDER_concurrent${n}`)));
    expect(new Set(orders.map((o) => o.expectedAtomic)).size).toBe(40);
    for (const o of orders) expect(await redis.get(amountKey(config, o.expectedAtomic))).toBe(o.id);
    expect(await command('TTL', `order:${orders[0].id}`)).toBe(-1);
  });
  it('accepts and settles current invoices after a long outage while preserving old history', async () => {
    const oldOrder = await invoice('ORDER_beforeOutage');
    const oldTx = transfer(oldOrder.expectedAtomic, 101, 100);
    head = 15000; clock = BASE + head * 1000;
    await scan();
    let watch = await redis.get(WATCH);
    expect(watch.status).toBe('catching_up');
    expect(watch.lastScannedBlock).toBeLessThan(head - 400);
    expect(watch.lastLiveScannedBlock).toBe(head);
    expect((await getOrder(oldOrder.id)).status).toBe('paid');
    expect((await redis.get(txKey(oldTx))).status).toBe('confirmed');
    const newOrder = await invoice('ORDER_afterOutage');
    const currentTx = transfer(newOrder.expectedAtomic, 15001, 101);
    head = 15025; clock = BASE + head * 1000;
    await scan();
    watch = await redis.get(WATCH);
    expect(watch.lastScannedBlock).toBeLessThan(10000);
    expect(watch.lastLiveScannedBlock).toBe(head);
    expect((await getOrder(newOrder.id)).status).toBe('paid');
    expect((await redis.get(txKey(currentTx))).status).toBe('confirmed');
    await scan();
    expect(await command('ZCARD', 'usdt:transactions')).toBe(2);
  });
  it('never recycles cancelled, expired or paid tails, and fails closed at exhaustion', async () => {
    const first = await invoice('ORDER_tail1', { tailMax: 2 });
    await cancelOrder(first.id);
    const second = await invoice('ORDER_tail2', { tailMax: 2 });
    expect(second.expectedAtomic).not.toBe(first.expectedAtomic);
    await expect(invoice('ORDER_tail3', { tailMax: 2 })).rejects.toThrow('exhausted');
  });
  it('detects, waits for confirmations, then atomically grants the existing purchase set', async () => {
    const o = await invoice(); const id = transfer(o.expectedAtomic);
    head = 105; await scan();
    expect((await getOrder(o.id)).status).toBe('confirming');
    expect(await getPurchasedIds(email)).toEqual([]);
    head = 125; await scan();
    expect((await getOrder(o.id)).status).toBe('paid');
    expect(await getPurchasedIds(email)).toEqual(['resource1']);
    expect((await redis.get(txKey(id))).status).toBe('confirmed');
    const paidAt = (await getOrder(o.id)).paidAt;
    await scan(); await scan();
    expect((await getOrder(o.id)).paidAt).toBe(paidAt);
    expect(await command('ZCARD', 'usdt:transactions')).toBe(1);
  });
  it('records a duplicate payment without replacing the first transaction or granting twice', async () => {
    const o = await invoice(); const first = transfer(o.expectedAtomic);
    head = 125; await scan();
    const second = transfer(o.expectedAtomic, 126, 2); head = 150; await scan();
    expect((await getOrder(o.id)).transferId).toBe(first);
    expect((await redis.get(txKey(second))).classification).toBe('duplicate');
    expect(await command('SCARD', `purchases:${hashKey(email)}`)).toBe(1);
  });
  it('retains underpayment and overpayment as unassigned transactions, never guessing a buyer', async () => {
    const o = await invoice(); const low = transfer(units('10')); const high = transfer(units('10.5'), 102, 2);
    head = 125; await scan();
    expect((await getOrder(o.id)).status).toBe('pending');
    for (const id of [low, high]) expect(await redis.get(txKey(id))).toMatchObject({ orderId: null, status: 'confirmed', classification: 'unmatched' });
    expect(await getPurchasedIds(email)).toEqual([]);
  });
  it('honors block inclusion time when confirmation finishes after expiry, and retains late transfers', async () => {
    const o = await invoice(); transfer(o.expectedAtomic, 999);
    head = 1002; clock = BASE + 1002000; await scan();
    expect((await getOrder(o.id)).status).toBe('confirming');
    head = 1030; await scan();
    expect((await getOrder(o.id)).status).toBe('paid');
    const late = transfer(o.expectedAtomic, 1031, 2); head = 1060; await scan();
    expect((await redis.get(txKey(late))).classification).toBe('late');
  });
  it('expires unpaid orders without deleting accounting or amount reservations', async () => {
    const o = await invoice(); clock = o.expiresAt + 1; await scan();
    expect((await getOrder(o.id)).status).toBe('expired');
    expect(await redis.get(amountKey(config, o.expectedAtomic))).toBe(o.id);
  });
  it('recovers after an RPC outage without skipping the failed range', async () => {
    const o = await invoice(); transfer(o.expectedAtomic); const cursor = (await redis.get(WATCH)).lastScannedBlock;
    head = 125; failLogs = true; await expect(scan()).rejects.toThrow();
    expect((await redis.get(WATCH)).lastScannedBlock).toBe(cursor);
    failLogs = false; await scan();
    expect((await getOrder(o.id)).status).toBe('paid');
  });
  it('recovers durable confirmed work after a crash before fulfillment', async () => {
    const o = await invoice(); const id = transfer(o.expectedAtomic); head = 125;
    const original = redis.eval;
    const spy = vi.spyOn(redis, 'eval').mockImplementationOnce((...args) => original(...args));
    let crashed = false;
    spy.mockImplementation((script, keys, args) => {
      if (script === FULFILL && !crashed) { crashed = true; throw new Error('process crash'); }
      return original(script, keys, args);
    });
    await expect(scan()).rejects.toThrow(); spy.mockRestore();
    expect((await redis.get(txKey(id))).status).toBe('confirmed');
    expect((await getOrder(o.id)).status).not.toBe('paid');
    await scan();
    expect((await getOrder(o.id)).status).toBe('paid');
  });
  it('removes orphaned pending observations and redetects canonical replacements', async () => {
    const o = await invoice(); const id = transfer(o.expectedAtomic); head = 105; await scan();
    events = []; receipts.clear(); head = 110; await scan();
    expect((await redis.get(txKey(id))).status).toBe('orphaned');
    expect((await getOrder(o.id)).status).toBe('pending');
    transfer(o.expectedAtomic, 111, 2); head = 135; await scan();
    expect((await getOrder(o.id)).status).toBe('paid');
  });
  it('keeps an expired invoice expired when its unconfirmed transfer is orphaned', async () => {
    const o = await invoice(); const id = transfer(o.expectedAtomic, 999);
    head = 1002; clock = BASE + 1002000; await scan();
    expect((await getOrder(o.id)).status).toBe('confirming');
    events = []; receipts.clear(); head = 1003; await scan();
    expect((await redis.get(txKey(id))).status).toBe('orphaned');
    expect((await getOrder(o.id)).status).toBe('expired');
    expect(await getPurchasedIds(email)).toEqual([]);
  });
  it('raises confirmation requirements, never lowering an existing order snapshot', async () => {
    const o = await invoice(); transfer(o.expectedAtomic); head = 125;
    await scan({ confirmations: 30 }); expect((await getOrder(o.id)).status).toBe('confirming');
    head = 115; await scan({ confirmations: 3 }); expect((await getOrder(o.id)).status).toBe('confirming');
    head = 130; await scan({ confirmations: 30 }); expect((await getOrder(o.id)).status).toBe('paid');
  });
  it('rejects stale workers, forged proofs and wrong-token transfers', async () => {
    const o = await invoice(); transfer(o.expectedAtomic, 101, 1, sender); head = 125; await scan();
    expect(await command('ZCARD', 'usdt:transactions')).toBe(0);
    await expect(fulfillOrder(o.id, hash(1))).rejects.toThrow();
    await redis.set(LOCK, 'new-owner');
    await expect(recordTransfer('old-owner', { id: 'fake' })).rejects.toThrow();
    expect(await getPurchasedIds(email)).toEqual([]);
  });
  it('uses the same atomic fulfillment for Alipay and WeChat concurrent notifications', async () => {
    for (const provider of ['alipay', 'wechat']) {
      const id = `ORDER_${provider}`;
      await saveOrder({ id, provider, email, datasetId: 'resource1', amount: 7000 });
      const results = await Promise.all(Array.from({ length: 10 }, () => fulfillOrder(id, 'verified-provider-tx')));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await getOrder(id)).status).toBe('paid');
    }
    expect(await command('SCARD', `purchases:${hashKey(email)}`)).toBe(1);
  });
});
