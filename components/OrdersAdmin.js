import { useCallback, useEffect, useState } from "react";
import styles from "../styles/Admin.module.css";

const PROVIDERS = [
  { value: "", label: "全部支付方式" },
  { value: "wechat", label: "微信支付" },
  { value: "alipay", label: "支付宝" },
  { value: "usdt", label: "USDT" },
];

const yuan = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;

function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "—";
}

function Stat({ label, value, sub }) {
  return (
    <div className={styles.statTile}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

// Paid orders across all payment methods, newest first.
export default function OrdersAdmin() {
  const [filters, setFilters] = useState({ provider: "", q: "", page: 1 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async (signal) => {
    const params = new URLSearchParams({ page: String(filters.page) });
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.q) params.set("q", filters.q);
    const res = await fetch(`/api/admin/orders?${params}`, { cache: "no-store", signal });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.message || "订单加载失败");
    return result;
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((result) => { setData(result); setError(""); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message || "订单加载失败"); });
    return () => controller.abort();
  }, [load, reload]);

  const backfill = async () => {
    if (busy) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill" }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "导入失败");
      setNotice(`检查了 ${result.scanned} 条订单记录，已收录 ${result.indexed} 笔已付款订单`);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message || "导入失败");
    } finally {
      setBusy(false);
    }
  };

  const stats = data?.stats;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = !!(filters.provider || filters.q);

  return (
    <div>
      <h2 className={styles.sectionTitle}>订单与销售</h2>
      {stats && (
        <div className={styles.statGrid}>
          <Stat label="今日" value={`${stats.todayCount} 笔`} sub={yuan(stats.todayCnyCents)} />
          <Stat label="本月" value={`${stats.monthCount} 笔`} sub={yuan(stats.monthCnyCents)} />
          <Stat label={filtered ? "筛选结果" : "累计"} value={`${stats.count} 笔`} sub={yuan(stats.cnyCents)} />
          <Stat label="USDT 收入" value={stats.usdt} sub={filtered ? "筛选结果" : "累计"} />
        </div>
      )}
      <p className={styles.hint}>人民币金额只统计微信和支付宝的实收；USDT 单独统计。按北京时间计算今日和本月。</p>

      <form className={styles.orderFilters} onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, q: search.trim(), page: 1 })); }}>
        <select className={styles.input} aria-label="支付方式" value={filters.provider}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value, page: 1 }))}>
          {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input className={styles.input} type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索邮箱、订单号、商品名、交易号" aria-label="搜索订单" />
        <button type="submit" className={styles.primaryBtn}>搜索</button>
      </form>

      {error && <p className={styles.msgErr} role="alert">{error}</p>}
      {notice && <p className={styles.msgOk} role="status">{notice}</p>}
      {!data && !error && <p className={styles.loading}>正在加载订单…</p>}

      {data && (data.orders.length === 0 ? (
        <p className={styles.emptyText}>{filtered ? "没有符合条件的订单" : "还没有已付款订单。如果之前已有销售，可点击下方“导入历史订单”。"}</p>
      ) : (
        <ul className={styles.itemList}>
          {data.orders.map((order) => (
            <li key={order.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>{order.productName}</span>
                <span className={styles.itemMeta}>
                  {[formatTime(order.paidAt), order.email, order.providerLabel,
                    order.deliveryStatus === "pending" ? "缺货待补发" : ""].filter(Boolean).join(" · ")}
                </span>
                <span className={styles.orderIds}>订单号 {order.id}{order.transactionId ? ` · 交易号 ${order.transactionId}` : ""}</span>
              </div>
              <strong className={styles.orderAmount}>{order.amount}</strong>
            </li>
          ))}
        </ul>
      ))}

      {data && pages > 1 && (
        <div className={styles.btnRow}>
          <button type="button" className={styles.secondaryBtn} disabled={filters.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</button>
          <span className={`${styles.hint} ${styles.pageInfo}`}>第 {filters.page} / {pages} 页 · 共 {data.total} 笔</span>
          <button type="button" className={styles.secondaryBtn} disabled={filters.page >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</button>
        </div>
      )}

      <div className={styles.listBlock}>
        <h3 className={styles.listTitle}>导入历史订单</h3>
        <p className={styles.hint}>
          订单列表从本次更新起自动记录。更新前的订单需要导入一次：USDT 订单可全部找回；微信和支付宝订单过去只保留 7 天，只能找回最近 7 天的。可重复执行，不会重复计数。
        </p>
        <div className={styles.btnRow}>
          <button type="button" className={styles.secondaryBtn} onClick={backfill} disabled={busy}>
            {busy ? "导入中…" : "导入历史订单"}
          </button>
        </div>
      </div>
    </div>
  );
}
