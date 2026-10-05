// Run as a supervised process on an always-on host. This worker holds NO
// wallet keys and invokes only the authenticated, bounded compensation scan.
const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || '');
const secret = process.env.CRON_SECRET || '';
if (base.protocol !== 'https:' || secret.length < 32) throw new Error('Configure HTTPS NEXT_PUBLIC_SITE_URL and CRON_SECRET (>=32 characters)');
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
while (!stopping) {
  try {
    const result = await fetch(new URL('/api/usdt/scan', base), { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(55000) });
    console.info(JSON.stringify({ event: 'USDT worker scan', ok: result.ok, status: result.status, at: new Date().toISOString() }));
  } catch { console.error(JSON.stringify({ event: 'USDT worker request failed', at: new Date().toISOString() })); }
  if (!stopping) await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      process.removeListener('SIGTERM', finish);
      process.removeListener('SIGINT', finish);
      resolve();
    };
    const timer = setTimeout(finish, 20000);
    process.once('SIGTERM', finish);
    process.once('SIGINT', finish);
  });
}
