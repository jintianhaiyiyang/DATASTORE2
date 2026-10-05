import { kv } from '@vercel/kv';
import { getOrder } from '../db';
import { fulfillOrder } from '../fulfillOrder';
import { getConfig } from './config';
import { connectRpc, blockData, hex, parseTransfer, quantity, topicAddress, TRANSFER_TOPIC } from './rpc';
import { acquireLease, releaseLease, renewLease, ensureWatch, saveWatch, WATCH, amountKey, txKey,
  recordTransfer, updateTransfer, finishTransfer, orphanTransfer, expireOrders } from './store';

export function classifyTransfer(order, tx) {
  if (!order) return 'unmatched';
  if (order.cancelledAt) return 'cancelled';
  if ((tx.blockTime < Math.floor(order.createdMs / 1000) || tx.blockNumber < order.minimumBlock)) return 'predates_order';
  if (tx.blockTime * 1000 > order.expiresAt) return 'late';
  if (order.status === 'paid' && order.transferId !== tx.id) return 'duplicate';
  const actual = BigInt(tx.actualAtomic), expected = BigInt(order.expectedAtomic);
  return actual < expected ? 'underpaid' : actual > expected ? 'overpaid' : 'exact';
}
function log(event, tx) {
  console.info(JSON.stringify({ event, orderId: tx?.orderId || null, txHash: tx?.txHash || null, blockNumber: tx?.blockNumber || null }));
}
async function verifyReceipt(rpc, tx, config) {
  const receipt = await rpc.call('eth_getTransactionReceipt', [tx.txHash]);
  if (!receipt) return null;
  if (receipt.transactionHash?.toLowerCase() !== tx.txHash || quantity(receipt.status) !== 1 || !Array.isArray(receipt.logs)) throw new Error('Invalid RPC receipt');
  const matching = receipt.logs.find((entry) => quantity(entry.logIndex) === tx.logIndex);
  const verified = matching && parseTransfer(matching, config);
  if (!verified || verified.actualAtomic !== tx.actualAtomic || verified.from !== tx.from ||
      verified.blockHash !== tx.blockHash || quantity(receipt.blockNumber) !== tx.blockNumber ||
      receipt.blockHash?.toLowerCase() !== tx.blockHash || verified.txHash !== tx.txHash) return null;
  const block = blockData(await rpc.call('eth_getBlockByNumber', [hex(tx.blockNumber), false]));
  return block.hash === tx.blockHash && block.number === tx.blockNumber ? block : null;
}
export async function scanPayments({ config: suppliedConfig, connect = connectRpc, now = Date.now } = {}) {
  const lease = await acquireLease();
  if (!lease) return { busy: true };
  let watch, rpc;
  const started = now();
  try {
    const config = suppliedConfig || await getConfig();
    const previous = await kv.get(WATCH);
    watch = previous;
    const rotate = previous?.rpcNext || 0;
    const urls = [...config.urls.slice(rotate), ...config.urls.slice(0, rotate)];
    rpc = await connect({ ...config, urls });
    watch = await ensureWatch(config, rpc.head);
    watch.rpcNext = (rotate + rpc.providerIndex) % config.urls.length;
    watch.currentBlock = rpc.head.number;
    watch.status = 'running';
    await renewLease(lease);
    // A changed checkpoint is a reorg; replay the overlap without deleting
    // accounting records. Receipt verification removes orphaned observations.
    let reorg = false;
    if (watch.lastScannedHash) {
      const checkpoint = blockData(await rpc.call('eth_getBlockByNumber', [hex(watch.lastScannedBlock), false]));
      reorg = checkpoint.hash !== watch.lastScannedHash;
    }
    let from = Math.max(watch.startBlock, watch.lastScannedBlock - 128 + 1);
    if (reorg) log('BSC reorg detected');
    // Bound each request. Subsequent cron runs continue the persistent cursor.
    for (let batch = 0; from <= rpc.head.number && batch < 8 && now() - started < 22000; batch++) {
      const to = Math.min(from + 199, rpc.head.number);
      const end = blockData(await rpc.call('eth_getBlockByNumber', [hex(to), false]));
      if (end.number !== to) throw new Error('Invalid RPC range');
      const logs = await rpc.call('eth_getLogs', [{ address: config.token, fromBlock: hex(from), toBlock: hex(to),
        topics: [TRANSFER_TOPIC, null, topicAddress(config.address)] }]);
      if (!Array.isArray(logs) || logs.length > 2000) throw new Error('Invalid RPC logs');
      const blocks = new Map();
      for (const entry of logs) {
        const parsed = parseTransfer(entry, config);
        if (!parsed) continue;
        if (parsed.blockNumber < from || parsed.blockNumber > to) throw new Error('RPC log outside range');
        if (!blocks.has(parsed.blockNumber)) blocks.set(parsed.blockNumber, blockData(await rpc.call('eth_getBlockByNumber', [hex(parsed.blockNumber), false])));
        const block = blocks.get(parsed.blockNumber);
        if (block.number !== parsed.blockNumber || block.hash !== parsed.blockHash) throw new Error('RPC chain changed');
        const id = `${parsed.txHash}:${parsed.logIndex}`;
        const orderId = await kv.get(amountKey(config, parsed.actualAtomic));
        const order = orderId ? await getOrder(orderId) : null;
        const tx = { ...parsed, id, orderId: order?.id || null, blockTime: block.timestamp,
          confirmations: Math.max(0, rpc.head.number - parsed.blockNumber + 1), status: 'confirming', discoveredAt: now() };
        tx.classification = classifyTransfer(order, tx);
        await renewLease(lease);
        if (await recordTransfer(lease, tx)) log('USDT payment detected', tx);
      }
      // Do not advance across a range whose canonical tip changed mid-query.
      const check = blockData(await rpc.call('eth_getBlockByNumber', [hex(to), false]));
      if (check.hash !== end.hash) throw new Error('RPC chain changed');
      await renewLease(lease);
      watch.lastScannedBlock = to;
      watch.lastScannedHash = end.hash;
      await saveWatch(lease, watch);
      from = to + 1;
    }
    // Process the oldest outstanding observations first, including a confirmed
    // transfer left queued by a crash between verification and fulfillment.
    const ids = await kv.zrange('usdt:unconfirmed', 0, 99);
    for (const id of ids) {
      if (now() - started > 45000) break;
      const tx = await kv.get(txKey(id));
      if (!tx) throw new Error('Missing durable transfer');
      const block = await verifyReceipt(rpc, tx, config);
      await renewLease(lease);
      if (!block) {
        await orphanTransfer(lease, tx, now());
        log('USDT payment orphaned', tx);
        continue;
      }
      tx.blockTime = block.timestamp;
      tx.confirmations = Math.max(0, rpc.head.number - tx.blockNumber + 1);
      const order = tx.orderId ? await getOrder(tx.orderId) : null;
      tx.classification = classifyTransfer(order, tx);
      const required = Math.max(config.confirmations, order?.requiredConfirmations || 0);
      tx.requiredConfirmations = required;
      if (tx.confirmations < required) {
        tx.status = 'confirming';
        await recordTransfer(lease, tx);
        log('USDT payment confirming', tx);
        continue;
      }
      tx.status = 'confirmed';
      await updateTransfer(lease, tx);
      if (tx.classification === 'exact') {
        await fulfillOrder(tx.orderId, tx.txHash, { transferId: id, lease });
        log('USDT payment confirmed', tx);
      }
      await finishTransfer(lease, id);
    }
    await expireOrders(lease, now());
    watch.lastSuccessAt = now();
    watch.status = watch.lastScannedBlock < rpc.head.number ? 'catching_up' : 'healthy';
    await saveWatch(lease, watch);
    log('BSC scanner recovered');
    return { status: watch.status, lastScannedBlock: watch.lastScannedBlock };
  } catch (error) {
    // Do not log raw exceptions: fetch/Redis errors can contain credentials.
    log('BSC scanner failed');
    if (watch) {
      watch.status = 'error'; watch.lastErrorAt = now();
      watch.rpcNext = (watch.rpcNext || 0) + 1;
      const urlsCount = suppliedConfig?.urls.length || [process.env.BSC_RPC_URL, process.env.BSC_RPC_URL_BACKUP].filter(Boolean).length;
      watch.rpcNext %= Math.max(1, urlsCount);
      await saveWatch(lease, watch).catch(() => {});
    }
    throw new Error('BSC scanner unavailable', { cause: error });
  } finally {
    await releaseLease(lease).catch(() => {});
  }
}
