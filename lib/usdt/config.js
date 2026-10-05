import { getSiteSettings } from '../db';
import { units } from './amount';

// Verified against BNB Chain's USDT-6D8 asset mapping on 2026-10-05.
// https://explorer.bnbchain.org/asset/USDT-6D8
// Binance-Peg USDT (BSC-USD), not an issuer-native Tether token.
export const VERIFIED_USDT = '0x55d398326f99059ff775485246999027b3197955';
export const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export function integer(value, fallback, min, max) {
  const text = String(value ?? fallback);
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) throw new Error('Invalid USDT configuration');
  return Number(text);
}
export function resolveConfig(settings = {}, env = process.env) {
  const address = String(env.BSC_PAYMENT_ADDRESS || settings.usdtPaymentAddress || '').toLowerCase();
  const token = String(env.BSC_USDT_CONTRACT || settings.usdtContract || '').toLowerCase();
  const rate = String(env.USDT_CNY_RATE || settings.usdtCnyRate || '');
  if (!addressPattern.test(address) || /^0x0{40}$/.test(address) || token !== VERIFIED_USDT || units(rate, 6) <= 0n) throw new Error('Invalid USDT configuration');
  const urls = [env.BSC_RPC_URL, env.BSC_RPC_URL_BACKUP].filter(Boolean);
  if (!urls.length) throw new Error('Missing BSC RPC');
  for (const value of urls) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid BSC RPC URL');
  }
  return {
    address, token, rate, urls,
    confirmations: integer(env.BSC_CONFIRMATIONS || settings.usdtConfirmations, 20, 3, 1000),
    timeoutMinutes: integer(env.USDT_PAYMENT_TIMEOUT_MINUTES || settings.usdtTimeoutMinutes, 15, 5, 120),
    tailMax: integer(env.USDT_TAIL_MAX || settings.usdtTailMax, 9999, 1, 999999),
  };
}
export async function getConfig() { return resolveConfig(await getSiteSettings()); }
