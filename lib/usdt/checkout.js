import { kv } from '@vercel/kv';
import { scanPayments } from './scanner';
import { WATCH } from './store';
import { scanReady } from './readiness';
export { scanReady } from './readiness';

export async function ensureCheckoutScan(config, head) {
  if (scanReady(await kv.get(WATCH), head)) return;
  // The same global gate as cashier polling bounds recovery work. The
  // scanner lease additionally prevents overlap with cron/admin scans.
  if (await kv.set('usdt:cashier:scan', '1', { nx: true, ex: 30 })) {
    await scanPayments({ config });
  }
  if (!scanReady(await kv.get(WATCH), head)) {
    throw new Error('USDT scanner not ready');
  }
}
