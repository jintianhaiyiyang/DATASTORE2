import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@vercel/kv', async () => ({ kv: (await import('./helpers/redis')).redis }));
import { command, redis } from './helpers/redis';
import { fulfillOrder } from '../lib/fulfillOrder';
import { saveOrder } from '../lib/db';
import { hashKey } from '../lib/security';
import { backfillPaidOrders, listPaidOrders, listUserOrders, PAID_ORDERS } from '../lib/orders';

const suite = process.env.REDIS_TEST_PORT ? describe : describe.skip;
const alice = 'alice@example.test', bob = 'bob@example.test';

suite('paid order ledger on real Redis', () => {
  beforeEach(async () => {
    await command('FLUSHDB'); // Disposable random-port Redis only.
    for (const email of [alice, bob]) await redis.set(`user:${hashKey(email)}`, { email, purchasedIds: [] });
    await redis.set('datasets', [{ id: 'p1', name: 'Product One', price: 9.9 }]);
  });

  it('indexes paid orders per user, keeps them permanently and snapshots the product name', async () => {
    await saveOrder({ id: 'ORDER_a1', provider: 'alipay', email: alice, datasetId: 'p1', amount: 990, currency: 'CNY' });
    await saveOrder({ id: 'ORDER_b1', provider: 'wechat', email: bob, datasetId: 'p1', amount: 990, currency: 'CNY' });
    await saveOrder({ id: 'ORDER_unpaid', provider: 'wechat', email: alice, datasetId: 'p1', amount: 990, currency: 'CNY' });
    expect(await command('TTL', 'order:ORDER_a1')).toBeGreaterThan(0);
    await fulfillOrder('ORDER_a1', 'tx-a1');
    await fulfillOrder('ORDER_b1', 'tx-b1');
    await fulfillOrder('ORDER_a1', 'tx-a1'); // duplicate notification
    expect(await command('TTL', 'order:ORDER_a1')).toBe(-1);
    expect(await command('TTL', 'order:ORDER_unpaid')).toBeGreaterThan(0);
    expect((await listPaidOrders()).map((o) => o.id).sort()).toEqual(['ORDER_a1', 'ORDER_b1']);
    const mine = await listUserOrders(alice);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: 'ORDER_a1', productName: 'Product One', status: 'paid' });
  });

  it('imports paid orders that predate the index, once', async () => {
    await redis.set('order:ORDER_old', { id: 'ORDER_old', provider: 'alipay', email: alice, datasetId: 'p1', amount: 500,
      status: 'paid', paidAt: '2026-01-02T03:04:05.000Z' }, { ex: 3600 });
    await redis.set('order:ORDER_oldpending', { id: 'ORDER_oldpending', email: alice, status: 'pending' }, { ex: 3600 });
    expect(await backfillPaidOrders()).toMatchObject({ indexed: 1, scanned: 2 });
    await backfillPaidOrders();
    expect(await command('ZCARD', PAID_ORDERS)).toBe(1);
    expect(await command('ZSCORE', PAID_ORDERS, 'ORDER_old')).toEqual(Date.parse('2026-01-02T03:04:05.000Z'));
    expect(await command('TTL', 'order:ORDER_old')).toBe(-1);
    expect((await listUserOrders(alice))[0].id).toBe('ORDER_old');
    expect(await listUserOrders(bob)).toEqual([]);
  });
});
