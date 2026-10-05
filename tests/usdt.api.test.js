import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getOrder: vi.fn(), kv: { get: vi.fn(), set: vi.fn(), sadd: vi.fn() }, cancel: vi.fn(), scan: vi.fn(), rate: vi.fn() }));
vi.mock('../lib/session', () => ({ withIronSessionApiRoute: (fn) => fn }));
vi.mock('../lib/db', () => ({ getOrder: mocks.getOrder }));
vi.mock('@vercel/kv', () => ({ kv: mocks.kv }));
vi.mock('../lib/usdt/store', async (original) => ({ ...await original(), cancelOrder: mocks.cancel }));
vi.mock('../lib/usdt/scanner', () => ({ scanPayments: mocks.scan }));
vi.mock('../lib/rateLimit', () => ({ consumeRateLimit: mocks.rate }));
import orderApi from '../pages/api/usdt/order';
import scanApi from '../pages/api/usdt/scan';
import adminApi from '../pages/api/admin/usdt';
const order = { id: 'ORDER_usdt123', email: 'buyer@example.test', provider: 'usdt', datasetId: 'dataset1', status: 'pending', address: `0x${'1'.repeat(40)}`, token: `0x${'2'.repeat(40)}`, expectedAtomic: '10000137000000000000', baseAtomic: '10000000000000000000', expiresAt: Date.now() + 900000, requiredConfirmations: 20 };
const req = () => ({ method: 'GET', headers: { origin: 'https://shop.example', host: 'shop.example' }, query: { orderId: order.id }, session: { user: { isLoggedIn: true, email: order.email } } });
const res = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; }, end() { return this; } });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://shop.example'); mocks.getOrder.mockResolvedValue(order); mocks.rate.mockResolvedValue({ allowed: true }); });
afterEach(() => vi.unstubAllEnvs());
describe('USDT API trust boundaries', () => {
  it('requires login and exact order ownership', async () => {
    const request = req(); request.session.user = null; const response = res(); await orderApi(request, response); expect(response.statusCode).toBe(401);
    request.session.user = { isLoggedIn: true, email: 'attacker@example.test' }; const other = res(); await orderApi(request, other); expect(other.statusCode).toBe(404);
  });
  it('returns only the public cashier projection', async () => {
    mocks.getOrder.mockResolvedValue({ ...order, secret: 'should-not-appear' });
    const response = res(); await orderApi(req(), response);
    expect(response.body.amount).toBe('10.000137');
    expect(JSON.stringify(response.body)).not.toContain('should-not-appear');
    expect(response.body).not.toHaveProperty('email');
  });
  it('cannot mark paid using POST, a claimed hash, a different order ID or client amounts', async () => {
    const request = req(); request.method = 'POST'; request.body = { paid: true, orderId: 'someone-else', amount: '0', txHash: `0x${'a'.repeat(64)}`, logIndex: 0 };
    const missing = res(); await orderApi(request, missing); expect(missing.statusCode).toBe(404);
    mocks.kv.get.mockResolvedValue({ id: `${request.body.txHash}:0`, actualAtomic: '10000000000000000000', from: `0x${'3'.repeat(40)}`, to: order.address, token: order.token, status: 'confirmed', orderId: null });
    const hint = res(); await orderApi(request, hint);
    expect(hint.body.state).toBe('underpaid'); expect(hint.body).not.toHaveProperty('paid');
    expect(mocks.kv.set.mock.calls.every(([key]) => key.startsWith('usdt:claim:'))).toBe(true);
    expect(mocks.scan).not.toHaveBeenCalled();
  });
  it('does not let a claim take another order’s transfer', async () => {
    mocks.kv.get.mockResolvedValue({ to: order.address, token: order.token, orderId: 'OTHER_ORDER', status: 'confirmed' });
    const request = req(); request.method = 'POST'; request.body = { txHash: `0x${'a'.repeat(64)}`, logIndex: 0 };
    const response = res(); await orderApi(request, response); expect(response.statusCode).toBe(404); expect(mocks.kv.set).not.toHaveBeenCalled();
  });
  it('blocks cross-origin cancellation and handles a concurrent confirming transition', async () => {
    const request = req(); request.method = 'DELETE'; request.headers.origin = 'https://evil.example';
    const blocked = res(); await orderApi(request, blocked); expect(blocked.statusCode).toBe(403); expect(mocks.cancel).not.toHaveBeenCalled();
    request.headers.origin = 'https://shop.example'; mocks.cancel.mockResolvedValue(0);
    const race = res(); await orderApi(request, race); expect(race.statusCode).toBe(409);
  });
  it('keeps scanner authentication independent of frontend sessions', async () => {
    vi.stubEnv('CRON_SECRET', 'test-only-cron-value-with-at-least-32-characters');
    const denied = res(); await scanApi(req(), denied); expect(denied.statusCode).toBe(401); expect(mocks.scan).not.toHaveBeenCalled();
    const request = req(); request.headers.authorization = `Bearer ${process.env.CRON_SECRET}`; mocks.scan.mockResolvedValue({ status: 'healthy' });
    const ok = res(); await scanApi(request, ok); expect(ok.statusCode).toBe(200);
  });
  it('denies non-admin access to transactions and configuration', async () => {
    const response = res(); await adminApi(req(), response); expect(response.statusCode).toBe(403);
  });
  it('recovers a missed scan and returns freshly verified paid status', async () => {
    mocks.kv.set.mockResolvedValue('OK');
    mocks.getOrder.mockResolvedValueOnce(order).mockResolvedValue({ ...order, status: 'paid' });
    const response = res(); await orderApi(req(), response);
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(response.body.status).toBe('paid');
    expect(mocks.kv.set).toHaveBeenCalledWith('usdt:cashier:scan', '1', { nx: true, ex: 30 });
  });
  it('limits concurrent cashier scans through one shared atomic gate', async () => {
    mocks.kv.set.mockResolvedValueOnce('OK').mockResolvedValue(null);
    await Promise.all([orderApi(req(), res()), orderApi(req(), res())]);
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(new Set(mocks.kv.set.mock.calls.map(([key]) => key))).toEqual(new Set(['usdt:cashier:scan']));
  });
  it('keeps status readable after an RPC failure, without accepting client paid hints', async () => {
    mocks.kv.set.mockResolvedValue('OK'); mocks.scan.mockRejectedValue(new Error('RPC unavailable'));
    const request = req(); request.query.paid = 'true'; request.query.txHash = `0x${'a'.repeat(64)}`;
    const response = res(); await orderApi(request, response);
    expect(response.statusCode).toBe(200); expect(response.body.status).toBe('pending');
  });
  it('does not scan for unauthenticated users or another order owner', async () => {
    mocks.kv.set.mockResolvedValue('OK');
    const request = req(); request.session.user = null; await orderApi(request, res());
    request.session.user = { isLoggedIn: true, email: 'other@example.test' }; await orderApi(request, res());
    expect(mocks.kv.set).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'paid' }, { status: 'invalid' }, { cancelledAt: Date.now() },
    { status: 'expired', expiresAt: Date.now() - 86400001 },
  ])('does not trigger scans for settled, cancelled or long-expired orders: %j', async (state) => {
    mocks.getOrder.mockResolvedValue({ ...order, ...state }); mocks.kv.set.mockResolvedValue('OK');
    await orderApi(req(), res()); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.kv.set).not.toHaveBeenCalled();
  });
  it('continues confirming and recently expired orders through the verified scanner', async () => {
    for (const status of ['confirming', 'expired']) {
      mocks.getOrder.mockResolvedValue({ ...order, status }); mocks.kv.set.mockResolvedValue('OK');
      await orderApi(req(), res());
    }
    expect(mocks.scan).toHaveBeenCalledTimes(2);
  });
});
