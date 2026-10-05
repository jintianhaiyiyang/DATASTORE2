import { describe, expect, it, vi } from 'vitest';
import { units, formatUnits, quoteMicros, paymentUri } from '../lib/usdt/amount';
import { resolveConfig, VERIFIED_USDT } from '../lib/usdt/config';
import { connectRpc, parseTransfer, TRANSFER_TOPIC, topicAddress, hex } from '../lib/usdt/rpc';
import { classifyTransfer } from '../lib/usdt/scanner';
const address = `0x${'1'.repeat(40)}`, sender = `0x${'2'.repeat(40)}`;
const config = { address, token: VERIFIED_USDT, urls: ['https://one.test/rpc?key=private', 'https://two.test'] };
const log = { address: VERIFIED_USDT, topics: [TRANSFER_TOPIC, topicAddress(sender), topicAddress(address)], data: hex(units('10.000137')).replace('0x', '0x' + '0'.repeat(64 - units('10.000137').toString(16).length)), transactionHash: `0x${'a'.repeat(64)}`, blockHash: `0x${'b'.repeat(64)}`, blockNumber: '0x64', logIndex: '0x1' };

describe('USDT exact money and identity', () => {
  it('quotes CNY with ceiling and preserves all 18 token decimals', () => {
    expect(quoteMicros('70', '7')).toBe(10000000n);
    expect(quoteMicros('1', '7')).toBe(142858n);
    expect(formatUnits(units('10.000137'))).toBe('10.000137');
    expect(formatUnits(units('0.000000000000000001'))).toBe('0.000000000000000001');
    expect(() => units('0.0000000000000000001')).toThrow();
    for (const input of ['-1','NaN','1e3','1.',' 1']) expect(() => units(input)).toThrow();
  });
  it('encodes chain 56, token transfer and atomic amount in ERC-681', () => {
    expect(paymentUri({ token: VERIFIED_USDT, address, expectedAtomic: '1000000000000000001' })).toBe(`ethereum:${VERIFIED_USDT}@56/transfer?address=${address}&uint256=1000000000000000001`);
  });
  it('only accepts verified token/address configuration', () => {
    const env = { BSC_RPC_URL: 'https://rpc.test', BSC_PAYMENT_ADDRESS: address, BSC_USDT_CONTRACT: VERIFIED_USDT, USDT_CNY_RATE: '7' };
    expect(resolveConfig({}, env).confirmations).toBe(20);
    expect(() => resolveConfig({}, { ...env, BSC_USDT_CONTRACT: sender })).toThrow();
    expect(() => resolveConfig({}, { ...env, BSC_CONFIRMATIONS: '1' })).toThrow();
    expect(() => resolveConfig({}, { ...env, BSC_RPC_URL: 'http://rpc.test' })).toThrow();
  });
  it('accepts USDT Transfer only, never BNB, another token or wrong recipient', () => {
    expect(parseTransfer(log, config)).toMatchObject({ actualAtomic: units('10.000137').toString(), from: sender, logIndex: 1 });
    expect(parseTransfer({ ...log, address: sender }, config)).toBeNull();
    expect(parseTransfer({ ...log, topics: [] }, config)).toBeNull();
    expect(parseTransfer({ value: '0x1', to: address }, config)).toBeNull();
    expect(parseTransfer({ ...log, topics: [TRANSFER_TOPIC, topicAddress(sender), topicAddress(sender)] }, config)).toBeNull();
    expect(() => parseTransfer({ ...log, data: '0x123' }, config)).toThrow();
  });
  it('does not guess order ownership for mismatched or late transfers', () => {
    const order = { createdMs: 1000000, minimumBlock: 100, expiresAt: 1900000, expectedAtomic: units('10.000137').toString() };
    const tx = { blockTime: 1001, blockNumber: 101, actualAtomic: units('10').toString() };
    expect(classifyTransfer(null, tx)).toBe('unmatched');
    expect(classifyTransfer(order, tx)).toBe('underpaid');
    expect(classifyTransfer(order, { ...tx, actualAtomic: units('10.5').toString() })).toBe('overpaid');
    expect(classifyTransfer(order, { ...tx, blockTime: 1901 })).toBe('late');
    expect(classifyTransfer(order, { ...tx, blockNumber: 99 })).toBe('predates_order');
  });
});
describe('RPC fallback and failures', () => {
  function fetcher(chain = 56) {
    return vi.fn(async (url, req) => {
      const body = JSON.parse(req.body);
      if (url.includes('one.test')) throw new Error('private-url');
      const result = { eth_chainId: hex(chain), eth_call: '0x12', eth_getLogs: [], eth_getBlockByNumber: { number: '0x64', timestamp: '0x64', hash: `0x${'b'.repeat(64)}` } }[body.method];
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) };
    });
  }
  it('switches providers and checks chain, decimals and log support', async () => {
    const f = fetcher(); const rpc = await connectRpc(config, f);
    expect(rpc.providerIndex).toBe(1);
    expect(rpc.head.number).toBe(100);
    expect(f.mock.calls.some(([, req]) => JSON.parse(req.body).method === 'eth_getLogs')).toBe(true);
  });
  it('rejects a working RPC on the wrong network', async () => { await expect(connectRpc(config, fetcher(1))).rejects.toThrow('BSC RPC unavailable'); });
  it('redacts RPC exceptions', async () => { await expect(connectRpc(config, async () => { throw new Error('secret api key'); })).rejects.toThrow(/^BSC RPC unavailable$/); });
});
