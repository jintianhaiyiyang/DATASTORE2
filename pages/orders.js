import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import DeliveryDialog from "../components/DeliveryDialog";
import { deliveryEntries } from "../lib/deliveryEntries";
import styles from "../styles/Orders.module.css";

function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "";
}

// "14 USDT · USDT" reads as a typo; the amount already names the currency.
const paidWith = (order) => (order.amount.includes(order.provider) ? order.amount : `${order.amount} · ${order.provider}`);

function OrderCard({ item, onOpen }) {
  const digital = item.category === "digital";
  const entries = item.available ? deliveryEntries(item) : [];
  const pendingCount = Array.isArray(item.deliveries) ? item.deliveries.filter((d) => d.pending).length : 0;
  const latest = item.orders[0];
  const download = !digital && typeof item.downloadUrl === "string" && /^https:\/\//i.test(item.downloadUrl);

  return (
    <li className={styles.card}>
      <div className={styles.cardTop}>
        <span className={`${styles.badge} ${!item.available ? styles.badgeGone : digital ? styles.badgeDigital : styles.badgeData}`}>
          {!item.available ? "已下架" : digital ? "数字商品" : "数据集"}
        </span>
        {pendingCount > 0 && <span className={styles.pending}>{pendingCount} 笔待补货</span>}
      </div>
      {item.available
        ? <Link href={`/dataset/${encodeURIComponent(item.datasetId)}`} className={styles.name}>{item.name}</Link>
        : <span className={styles.name}>{item.name}</span>}
      <p className={styles.meta}>
        {latest ? `最近购买 ${formatTime(latest.paidAt)} · ${paidWith(latest)}` : "早期购买记录"}
        {item.orders.length > 1 && ` · 共 ${item.orders.length} 笔`}
      </p>

      <div className={styles.actions}>
        {digital && entries.length > 0 && (
          <button type="button" className={styles.primary} onClick={() => onOpen(item, entries)}>查看购买内容</button>
        )}
        {download && <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className={styles.primary}>前往下载</a>}
        {item.available && !download && !(digital && entries.length) && <span className={styles.muted}>内容暂不可用，请联系站点管理员</span>}
        {!item.available && <span className={styles.muted}>商品已下架，如需找回请联系站点管理员</span>}
      </div>

      {item.orders.length > 0 && (
        <details className={styles.history}>
          <summary>订单记录（{item.orders.length}）</summary>
          <ul>
            {item.orders.map((order) => (
              <li key={order.id}>
                <span>{formatTime(order.paidAt)}</span>
                <span>{paidWith(order)}</span>
                <code>{order.id}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/my/orders", { cache: "no-store", signal: controller.signal });
        if (res.status === 401) { await router.replace(`/login?next=${encodeURIComponent("/orders")}`); return; }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "订单加载失败，请重试");
        if (!controller.signal.aborted) { setItems(Array.isArray(data.items) ? data.items : []); setError(""); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || "网络异常，请重试");
      }
    })();
    return () => controller.abort();
  }, [router, retry]);

  const open = useCallback((item, entries) => setDialog({ name: item.name, entries }), []);
  const close = useCallback(() => setDialog(null), []);

  return (
    <Layout title="我的订单">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>我的订单</h1>
          <p>购买过的数据集和数字商品都在这里，可随时重新查看发货内容。</p>
        </header>
        {error && (
          <div className={styles.empty} role="alert">
            <p>{error}</p>
            <button type="button" className={styles.secondary} onClick={() => { setError(""); setItems(null); setRetry((n) => n + 1); }}>重新加载</button>
          </div>
        )}
        {!error && items === null && <p className={styles.empty} role="status">正在加载订单…</p>}
        {items?.length === 0 && (
          <div className={styles.empty}>
            <p>还没有购买记录</p>
            <Link href="/" className={styles.secondary}>去逛逛</Link>
          </div>
        )}
        {items?.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => <OrderCard key={item.datasetId} item={item} onOpen={open} />)}
          </ul>
        )}
      </div>
      {dialog && <DeliveryDialog name={dialog.name} title="已购内容" entries={dialog.entries} onClose={close} />}
    </Layout>
  );
}
