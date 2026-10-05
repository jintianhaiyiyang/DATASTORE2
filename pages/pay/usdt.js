import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import Layout from '../../components/Layout';
import styles from '../../styles/Usdt.module.css';

const labels = { pending: '等待支付', confirming: '检测到交易 · 等待区块确认', paid: '支付成功', expired: '订单超时', invalid: '订单已取消', underpaid: '支付金额不足', overpaid: '支付金额超过应付金额' };
export function UsdtCashier({ order, remaining, addressOnly, setAddressOnly, copy, notice }) {
  return <section className={styles.card}>
    <div className={styles.heading}><svg aria-label="USDT" role="img" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="22" fill="#26a17b"/><path fill="white" d="M10 10h24v5H25v4c6 .3 10 1.2 10 2.7s-4 2.6-10 2.8V35h-6V24.5C13 24.3 9 23.2 9 21.7S13 19.3 19 19v-4h-9zm9 10.5c-4 .2-7 1-7 1.2 0 .6 5 1.4 10 1.4s10-.8 10-1.4c0-.2-3-1-7-1.2v1.7h-6z"/></svg><div><h1>USDT 收银台</h1><p>USDT (BEP-20 / BNB Smart Chain)</p></div></div>
    <p className={styles.status} role="status">{labels[order.status] || order.status}{order.status === 'confirming' && ` · ${order.confirmations}/${order.requiredConfirmations}`}</p>
    {order.status === 'paid' ? <div className={styles.success}><h2>✓ 支付成功</h2><p>购买权限已解锁，即将进入资源页面。</p></div> : <>
      <p>应付金额</p><div className={styles.amount}>{order.amount}<span> USDT</span></div>
      <button onClick={() => copy(order.amount)} className={styles.button}>复制支付金额</button>
      <p className={styles.muted}>商品 ¥{order.cnyPrice} · 报价汇率：1 USDT = ¥{order.cnyPerUsdt} · 基础金额 {order.baseAmount} USDT，已加入订单识别尾数</p>
      <p><strong>网络：BNB Smart Chain (BEP-20)</strong></p>
      {order.status === 'pending' && remaining > 0 && <div className={styles.qr}><QRCodeSVG value={addressOnly ? order.address : order.uri} size={224} marginSize={4} title={addressOnly ? 'BSC 收款地址二维码' : 'BSC USDT 支付请求二维码'}/></div>}
      <label className={styles.toggle}><input type="checkbox" checked={addressOnly} onChange={(e) => setAddressOnly(e.target.checked)}/>钱包不识别？改用纯地址二维码</label>
      <p className={styles.muted}>纯地址二维码不包含币种、网络或金额，请逐项核对。无需连接钱包。</p>
      <label>收款钱包地址</label><code className={styles.address}>{order.address}</code>
      <button onClick={() => copy(order.address)} className={styles.button}>复制钱包地址</button>
      <p className={styles.countdown}>{remaining > 0 ? `剩余 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '付款时间已结束，请勿再转账'}</p>
      <div className={styles.warning}>请务必使用 BNB Smart Chain（BEP-20）网络发送 USDT，并严格按照页面显示的金额付款，否则系统可能无法自动识别订单。<strong>不要使用 TRC20、ERC20、Solana 等其他网络。</strong></div>
      <p className={styles.muted}>平台抽成 0%。链上 Gas 或交易所提币费由付款方承担；请核对最终到账金额。交易所若无法输入 6 位小数，请使用支持该精度的钱包。请勿重复付款。</p>
      {(order.status === 'expired' || order.status === 'invalid') && <p className={styles.warning}>已广播的交易仍会继续检查。以实际入块时间判定是否逾期；过期或取消后的转账保留给管理员核对，不自动退款。</p>}
    </>}
    {order.txHash && <a className={styles.link} href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">在 BscScan 查看交易 ↗</a>}
    <p role="status">{notice}</p>
    <Link className={styles.link} href={`/dataset/${encodeURIComponent(order.datasetId)}`}>返回资源页面</Link>
  </section>;
}
export default function UsdtPage() {
  const router = useRouter();
  const id = typeof router.query.orderId === 'string' ? router.query.orderId : '';
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [now, setNow] = useState(0), [offset, setOffset] = useState(0), [addressOnly, setAddressOnly] = useState(false);
  const [txHash, setTxHash] = useState(''), [logIndex, setLogIndex] = useState('0');
  useEffect(() => {
    if (!id) return;
    let stopped = false, timer;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const res = await fetch(`/api/usdt/order?orderId=${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal });
        const data = await res.json();
        if (stopped) return;
        if (res.status === 401) { await router.replace(`/login?next=${encodeURIComponent(router.asPath)}`); return; }
        if (!res.ok) throw new Error(data.message || '查询失败');
        setOrder(data); setError(''); setOffset(data.serverNow - Date.now()); setNow(Date.now());
        if (data.status === 'paid') { timer = setTimeout(() => router.replace(`/dataset/${encodeURIComponent(data.datasetId)}`), 2500); return; }
      } catch (err) { if (!stopped) setError(err.message || '查询暂时中断，将自动重试'); }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [id, router]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setNotice('已复制'); } catch { setNotice('复制失败，请长按或选中文本复制'); } };
  const action = async (method) => {
    try {
      const res = await fetch(`/api/usdt/order?orderId=${encodeURIComponent(id)}`, { method, headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ txHash, logIndex: Number(logIndex) }) } : {}) });
      const data = await res.json(); setNotice(data.message || '已记录');
    } catch { setNotice('请求失败，请稍后重试'); }
  };
  return <Layout title="USDT 收银台"><main className={styles.page}>
    {error && <p className={styles.warning} role="alert">{error}；请勿重复付款。</p>}
    {order ? <><UsdtCashier order={order} remaining={Math.max(0, Math.ceil((order.expiresAt - now - offset) / 1000))} addressOnly={addressOnly} setAddressOnly={setAddressOnly} copy={copy} notice={notice}/>
      {order.status !== 'paid' && <section className={styles.card}><h2>已转账但金额不一致？</h2><p>提交 Hash 和 Transfer 日志序号供核对。申请不会证明交易归属，也不会自动解锁资源。</p>
        <form onSubmit={(e) => { e.preventDefault(); void action('POST'); }}><label>交易 Hash<input required pattern="0x[0-9a-fA-F]{64}" value={txHash} onChange={(e) => setTxHash(e.target.value)}/></label><label>Transfer 日志序号（BscScan Logs）<input required type="number" min="0" step="1" value={logIndex} onChange={(e) => setLogIndex(e.target.value)}/></label><button className={styles.button}>查询并记录</button></form>
        {['pending', 'expired'].includes(order.status) && <button className={styles.button} onClick={() => action('DELETE')}>取消此订单</button>}
      </section>}</> : <p>正在读取订单…</p>}
  </main></Layout>;
}
