export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const hex = (n) => `0x${BigInt(n).toString(16)}`;
export const topicAddress = (a) => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
export function quantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Invalid RPC quantity');
  const n = Number(BigInt(value));
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid RPC quantity');
  return n;
}
export function blockData(block) {
  if (!block || !/^0x[0-9a-f]{64}$/i.test(block.hash)) throw new Error('Invalid RPC block');
  return { number: quantity(block.number), timestamp: quantity(block.timestamp), hash: block.hash.toLowerCase() };
}
// A scan is pinned to one provider. Any failure restarts the NEXT invocation
// on the backup, rather than mixing inconsistent chain views in one scan.
export async function connectRpc(config, fetcher = fetch) {
  for (let index = 0; index < config.urls.length; index++) {
    const url = config.urls[index];
    let id = 0;
    const call = async (method, params = []) => {
      const requestId = ++id;
      try {
        const res = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }), signal: AbortSignal.timeout(7000), redirect: 'error' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.error || data.id !== requestId || data.jsonrpc !== '2.0' || !Object.hasOwn(data, 'result')) throw new Error();
        return data.result;
      } catch { throw new Error('BSC RPC unavailable'); } // Never propagate an API-key-bearing URL.
    };
    try {
      if (quantity(await call('eth_chainId')) !== 56) throw new Error('Wrong chain');
      const decimals = await call('eth_call', [{ to: config.token, data: '0x313ce567' }, 'latest']);
      if (quantity(decimals) !== 18) throw new Error('Wrong token decimals');
      // Public BSC endpoints sometimes disable eth_getLogs; probe before use.
      const head = blockData(await call('eth_getBlockByNumber', ['latest', false]));
      const logs = await call('eth_getLogs', [{ address: config.token, fromBlock: hex(head.number), toBlock: hex(head.number), topics: [TRANSFER_TOPIC, null, topicAddress(config.address)] }]);
      if (!Array.isArray(logs)) throw new Error('Invalid RPC logs');
      return { call, head, providerIndex: index };
    } catch { console.warn(JSON.stringify({ event: 'BSC RPC failed', providerIndex: index })); }
  }
  throw new Error('BSC RPC unavailable');
}
export function parseTransfer(log, config) {
  if (log?.address?.toLowerCase() !== config.token || log?.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC ||
      log?.topics?.[2]?.toLowerCase() !== topicAddress(config.address)) return null;
  if (log.removed || log.topics.length !== 3 || !/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[1]) ||
      !/^0x[0-9a-f]{64}$/i.test(log.data) || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash) ||
      !/^0x[0-9a-f]{64}$/i.test(log.blockHash)) throw new Error('Invalid transfer log');
  const value = BigInt(log.data);
  if (value === 0n) return null;
  return { txHash: log.transactionHash.toLowerCase(), logIndex: quantity(log.logIndex), blockNumber: quantity(log.blockNumber),
    blockHash: log.blockHash.toLowerCase(), from: `0x${log.topics[1].slice(-40).toLowerCase()}`, to: config.address,
    token: config.token, actualAtomic: value.toString() };
}
