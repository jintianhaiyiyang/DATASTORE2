import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  kv: { get: vi.fn(), set: vi.fn() }, scan: vi.fn(), connect: vi.fn(), config: vi.fn(), reserve: vi.fn(),
  db: { getDatasets: vi.fn(), getPurchasedIds: vi.fn(), getSiteSettings: vi.fn(), getOrder: vi.fn(), saveOrder: vi.fn() },
  rate: vi.fn(),
}));
vi.mock('@vercel/kv', () => ({ kv: m.kv }));
vi.mock('../lib/session', () => ({ withIronSessionApiRoute: (fn) => fn }));
vi.mock('../lib/db', () => m.db);
vi.mock('../lib/rateLimit', () => ({ consumeRateLimit: m.rate }));
vi.mock('../lib/usdt/config', () => ({ getConfig: m.config }));
vi.mock('../lib/usdt/rpc', () => ({ connectRpc: m.connect }));
vi.mock('../lib/usdt/scanner', () => ({ scanPayments: m.scan }));
vi.mock('../lib/usdt/store', () => ({ WATCH: 'usdt:watch', reserveOrder: m.reserve, cancelOrder: vi.fn() }));
import checkout from '../pages/api/checkout';
import { scanReady } from '../lib/usdt/checkout';

const config = { confirmations: 20 };
const head = { number: 10000 };
const fresh = () => ({ lastSuccessAt: Date.now(), lastScannedBlock: head.number });
const req = () => ({ method: 'POST', headers: { origin: 'https://shop.example', host: 'shop.example' },
  body: { datasetId: 'resource1', provider: 'usdt', clientType: 'bep20', amount: '0' },
  session: { user: { isLoggedIn: true, email: 'buyer@example.test' } } });
const res = () => ({ statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.example');
  m.db.getDatasets.mockResolvedValue([{ id: 'resource1', name: 'Resource', price: 70 }]);
  m.db.getSiteSettings.mockResolvedValue({ enableUsdt: true }); m.db.getPurchasedIds.mockResolvedValue([]);
  m.rate.mockResolvedValue({ allowed: true }); m.config.mockResolvedValue(config);
  m.connect.mockResolvedValue({ head }); m.kv.get.mockResolvedValue(fresh()); m.kv.set.mockResolvedValue('OK');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('USDT checkout scan recovery', () => {
  it('creates from server price without an extra scan when progress is fresh', async () => {
    const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(200);
    expect(m.scan).not.toHaveBeenCalled();
    expect(m.reserve).toHaveBeenCalledWith(expect.objectContaining({ cnyPrice: '70', datasetId: 'resource1' }), config, head);
  });
  it.each([null, { lastSuccessAt: 1, lastScannedBlock: 10000 }, { lastSuccessAt: Date.now(), lastScannedBlock: 9000 }])(
    'recovers an absent, idle or lagging watch before allocating an invoice: %j', async (watch) => {
      m.kv.get.mockResolvedValueOnce(watch).mockResolvedValue(fresh());
      const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(200);
      expect(m.scan).toHaveBeenCalledWith({ config }); expect(m.reserve).toHaveBeenCalledTimes(1);
      expect(m.scan.mock.invocationCallOrder[0]).toBeLessThan(m.reserve.mock.invocationCallOrder[0]);
      expect(m.kv.set).toHaveBeenCalledWith('usdt:cashier:scan', '1', { nx: true, ex: 30 });
    });
  it('refuses invoices while another scan is busy and progress remains stale', async () => {
    m.kv.get.mockResolvedValue(null); m.kv.set.mockResolvedValue(null);
    const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(503);
    expect(r.body.message).toContain('30 秒'); expect(m.scan).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
  });
  it('accepts fresh progress left by a concurrent scan without starting another', async () => {
    m.kv.get.mockResolvedValueOnce(null).mockResolvedValue(fresh()); m.kv.set.mockResolvedValue(null);
    const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(200); expect(m.scan).not.toHaveBeenCalled();
  });
  it('refuses invoices when recovery failed or did not catch up', async () => {
    m.kv.get.mockResolvedValue(null);
    const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(503); expect(m.reserve).not.toHaveBeenCalled();
    m.scan.mockRejectedValue(new Error('RPC failure'));
    const failed = res(); await checkout(req(), failed); expect(failed.statusCode).toBe(503); expect(m.reserve).not.toHaveBeenCalled();
  });
  it('does not invoice a resource settled by the recovery scan', async () => {
    m.kv.get.mockResolvedValueOnce(null).mockResolvedValue(fresh());
    m.db.getPurchasedIds.mockResolvedValueOnce([]).mockResolvedValue(['resource1']);
    const r = res(); await checkout(req(), r); expect(r.statusCode).toBe(409); expect(m.reserve).not.toHaveBeenCalled();
  });
  it('never scans for unauthenticated buyers or disabled payment', async () => {
    const request = req(); request.session.user = null; await checkout(request, res());
    m.db.getSiteSettings.mockResolvedValue({ enableUsdt: false }); await checkout(req(), res());
    expect(m.scan).not.toHaveBeenCalled(); expect(m.connect).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
  });
  it('keeps RPC failures distinct from amount allocation errors', async () => {
    m.connect.mockRejectedValueOnce(new Error('wrong chain / RPC unavailable'));
    const rpcError = res(); await checkout(req(), rpcError); expect(rpcError.body.message).toContain('BSC 网络'); expect(m.reserve).not.toHaveBeenCalled();
    m.reserve.mockRejectedValue(new Error('amount space exhausted'));
    const allocationError = res(); await checkout(req(), allocationError); expect(allocationError.body.message).toContain('金额');
  });
  it('preserves the time and cursor readiness limits', () => {
    expect(scanReady({ lastSuccessAt: 1000, lastScannedBlock: 9600 }, head, 181000)).toBe(true);
    expect(scanReady({ lastSuccessAt: 1000, lastScannedBlock: 9599 }, head, 181000)).toBe(false);
    expect(scanReady({ lastSuccessAt: 1000, lastScannedBlock: 10000 }, head, 181001)).toBe(false);
  });
});
