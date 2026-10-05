import { useCallback, useEffect, useState } from 'react';
import styles from '../styles/Usdt.module.css';

const date = (value) => value ? new Date(value).toLocaleString() : '—';
export default function UsdtAdmin() {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0);
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/usdt?offset=${offset}`, { cache: 'no-store' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message);
    setData(result); setForm((old) => old || result.config);
  }, [offset]);
  useEffect(() => { const timer = setTimeout(() => { void load().catch((e) => setMessage(e.message)); }, 0); return () => clearTimeout(timer); }, [load]);
  const send = async (method, body) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/usdt', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      if (result.config) setForm(result.config);
      setMessage(result.message || `扫描完成：${result.status || (result.busy ? '已有扫描运行' : '完成')}，区块 ${result.currentBlock || result.lastScannedBlock || '—'}`);
      await load();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  if (!data || !form) return <p role="status">{message || '加载 USDT 配置…'}</p>;
  const watch = data.watch;
  const fields = [['address','BSC 收款公开地址'],['token','BSC USDT 合约地址'],['rate','报价汇率：1 USDT 等于多少 CNY'],['confirmations','所需确认数（3–1000）'],['timeoutMinutes','订单超时分钟（5–120）'],['tailMax','最多尾数（1–999999；每单位 0.000001 USDT）']];
  return <div>
    <section className={styles.card}><h2>USDT / BSC 收款设置</h2>
      <p>资金直接进入你的钱包，平台抽成 0%。这里只配置公开收款信息，绝不填写钱包私钥或助记词。</p>
      <form onSubmit={(e) => { e.preventDefault(); void send('PUT', form); }}>
        <label className={styles.toggle}><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })}/>启用 USDT (BEP-20 / BNB Smart Chain)</label>
        {fields.map(([key, label]) => <label key={key}>{label}<input required value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}/></label>)}
        <p className={styles.muted}>尾数按报价递增，永久保留、不自动回收，避免迟到和重复付款误匹配。用尽后停止创建该报价的订单。修改汇率不影响旧订单。</p>
        <p>RPC URL 在部署环境设置：<code>BSC_RPC_URL</code>、<code>BSC_RPC_URL_BACKUP</code>。带 API Key 的 URL 不传入浏览器。</p>
        <p>主 RPC：{form.rpcConfigured ? '已配置' : '未配置'}；备用：{form.backupConfigured ? '已配置' : '未配置'}</p>
        <p className={styles.muted}>环境变量优先于后台输入。当前覆盖项：{form.envOverrides.join('、') || '无'}</p>
        <button className={styles.button} disabled={busy}>保存 USDT 配置</button>
      </form>
      <button className={styles.button} disabled={busy} onClick={() => send('POST', { action: 'health' })}>检查 RPC 连接</button>
      <button className={styles.button} disabled={busy} onClick={() => send('POST', { action: 'scan' })}>执行一次补偿扫描</button>
      <p role="status">{message}</p>
      <p>扫描状态：{watch?.status || '未初始化'}；当前区块：{watch?.currentBlock ?? '—'}；最近扫描区块：{watch?.lastScannedBlock ?? '—'}</p>
      <p>最近成功扫描：{date(watch?.lastSuccessAt)}；最近错误：{date(watch?.lastErrorAt)}</p>
      <p className={styles.warning}>必须部署每分钟运行的持久调度任务。超过 3 分钟未成功扫描会拒绝新订单；关闭支付开关不会停止旧订单补偿扫描。仅有网页轮询不能代替扫描器。</p>
    </section>
    <section className={styles.card}><h2>USDT 链上交易</h2><p>未匹配、少付、多付、逾期及重复转账均保留。查询申请只表示用户声称该交易属于其订单，不能据此自动发货。</p>
      <button className={styles.button} onClick={() => load().catch((e) => setMessage(e.message))}>刷新交易记录</button>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{['订单 / 用户','应付 / 实收 USDT','付款 / 收款地址','交易 Hash / 日志序号','区块 / 确认数','状态','创建 / 发现 / 完成','金额异常查询申请'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {data.transactions.map((tx) => <tr key={tx.id}><td>{tx.orderId || '未匹配'}<br/>{tx.email || '—'}</td><td>{tx.expected || '待核对'} / {tx.actual}</td><td>{tx.from}<br/>{tx.to}</td><td><a className={styles.link} href={`https://bscscan.com/tx/${tx.txHash}`} target="_blank" rel="noreferrer">{tx.txHash}</a><br/>logIndex: {tx.logIndex}</td><td>{tx.blockNumber}<br/>{tx.confirmations}</td><td>{tx.status}<br/>{tx.classification}</td><td>{date(tx.createdAt)}<br/>{date(tx.discoveredAt)}<br/>{date(tx.paidAt)}</td><td>{tx.claims.map((claim) => <p key={claim.orderId}>{claim.orderId} / {claim.email}<br/>{claim.state}；应付 {claim.expected}；多付 {claim.excess || '0'}</p>)}</td></tr>)}
      </tbody></table></div>
      {!data.transactions.length && <p>暂无扫描到的 USDT 转账。</p>}
      <button className={styles.button} disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button>
      <button className={styles.button} disabled={!data.hasMore} onClick={() => setOffset(offset + 50)}>下一页</button>
    </section>
  </div>;
}
