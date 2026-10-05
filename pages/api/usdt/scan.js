import { timingSafeEqual } from 'node:crypto';
import { scanPayments } from '../../../lib/usdt/scanner';

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).end();
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ message: 'Unauthorized' });
  try { return res.status(200).json(await scanPayments()); }
  catch { return res.status(503).json({ message: 'Scanner unavailable' }); }
}
