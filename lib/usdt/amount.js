// All monetary arithmetic is integer-only. Never round a transfer value.
export function units(value, decimals = 18) {
  const text = String(value);
  if (!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(text) || text.length > 80) throw new Error('Invalid decimal amount');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
}
export function formatUnits(value, decimals = 18) {
  const n = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${n / scale}${fraction ? `.${fraction}` : ''}`;
}
export function quoteMicros(cny, cnyPerUsdt) {
  const cents = units(cny, 2);
  const rate = units(cnyPerUsdt, 6);
  if (cents <= 0n || cents > 100000000n || rate <= 0n) throw new Error('Invalid quote');
  return (cents * 10000000000n + rate - 1n) / rate;
}
export function paymentUri(order) {
  return `ethereum:${order.token}@56/transfer?address=${order.address}&uint256=${order.expectedAtomic}`;
}
