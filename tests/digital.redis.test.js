import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@vercel/kv', async () => ({ kv: (await import('./helpers/redis')).redis }));
import { command, redis } from './helpers/redis';
import { fulfillOrder } from '../lib/fulfillOrder';
import { getOrder, getPurchasedIds, saveOrder } from '../lib/db';
import { hashKey } from '../lib/security';
import { addStock, getDeliveries, getPendingCount, getStockCount, getStockItems } from '../lib/digital';

const suite = process.env.REDIS_TEST_PORT ? describe : describe.skip;
const email = 'buyer@example.test', other = 'other@example.test';
const product = { id: 'digital1', name: 'Accounts', price: 5, category: 'digital', deliveryMode: 'stock' };

async function paidOrder(id, owner = email) {
  await saveOrder({ id, provider: 'alipay', email: owner, datasetId: product.id, amount: 500, currency: 'CNY' });
  return fulfillOrder(id, `tx-${id}`);
}

suite('digital goods stock delivery on real Redis', () => {
  beforeEach(async () => {
    await command('FLUSHDB'); // Disposable random-port Redis only.
    for (const user of [email, other]) await redis.set(`user:${hashKey(user)}`, { email: user, purchasedIds: [] });
    await redis.set('datasets', [product]);
  });

  it('gives every paid order its own item and keeps values verbatim', async () => {
    await addStock(product.id, ['000123', 'user-a----pass', '{"json":true}']);
    expect(await getStockItems(product.id)).toEqual(['000123', 'user-a----pass', '{"json":true}']);
    await paidOrder('ORDER_d1'); await paidOrder('ORDER_d2'); await paidOrder('ORDER_d3', other);
    const mine = await getDeliveries(email, product.id);
    expect(mine.map((d) => d.item).sort()).toEqual(['000123', 'user-a----pass']);
    expect((await getDeliveries(other, product.id))[0].item).toBe('{"json":true}');
    expect(await getStockCount(product.id)).toBe(0);
    expect((await getOrder('ORDER_d1')).deliveryStatus).toBe('delivered');
    expect(await getPurchasedIds(email)).toEqual([product.id]);
  });

  it('delivers exactly once under concurrent notifications for one order', async () => {
    await addStock(product.id, ['a', 'b', 'c']);
    await saveOrder({ id: 'ORDER_dup', provider: 'wechat', email, datasetId: product.id, amount: 500, currency: 'CNY' });
    const results = await Promise.all(Array.from({ length: 10 }, () => fulfillOrder('ORDER_dup', 'tx')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await getDeliveries(email, product.id)).toHaveLength(1);
    expect(await getStockCount(product.id)).toBe(2);
  });

  it('never hands one item to two buyers when orders race for the last item', async () => {
    await addStock(product.id, ['last-one']);
    await Promise.all(['ORDER_r1', 'ORDER_r2', 'ORDER_r3'].map((id) => saveOrder({ id, provider: 'alipay', email, datasetId: product.id, amount: 500, currency: 'CNY' })));
    await Promise.all(['ORDER_r1', 'ORDER_r2', 'ORDER_r3'].map((id) => fulfillOrder(id, `tx-${id}`)));
    const deliveries = await getDeliveries(email, product.id);
    expect(deliveries.filter((d) => d.item === 'last-one')).toHaveLength(1);
    expect(deliveries.filter((d) => d.pending)).toHaveLength(2);
    expect(await getPendingCount(product.id)).toBe(2);
  });

  it('queues paid orders when sold out and serves them first on restock, in order', async () => {
    await paidOrder('ORDER_wait1'); await paidOrder('ORDER_wait2', other);
    expect((await getOrder('ORDER_wait1')).deliveryStatus).toBe('pending');
    expect((await getDeliveries(email, product.id))[0]).toMatchObject({ orderId: 'ORDER_wait1', pending: true, item: null });
    const result = await addStock(product.id, ['first', 'second', 'third']);
    expect(result).toEqual({ delivered: 2, count: 1 });
    expect((await getDeliveries(email, product.id))[0]).toMatchObject({ item: 'first', pending: false });
    expect((await getDeliveries(other, product.id))[0].item).toBe('second');
    expect(await getPendingCount(product.id)).toBe(0);
    expect(await getStockItems(product.id)).toEqual(['third']);
  });

  it('does not touch stock for fixed-content products or datasets', async () => {
    await redis.set('datasets', [{ ...product, deliveryMode: 'fixed', deliveryContent: 'x' }]);
    await addStock(product.id, ['keep']);
    await paidOrder('ORDER_fixed');
    expect(await getStockCount(product.id)).toBe(1);
    expect(await getDeliveries(email, product.id)).toEqual([]);
    expect((await getOrder('ORDER_fixed')).status).toBe('paid');
  });
});
