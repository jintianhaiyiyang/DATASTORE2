import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import PaymentPanel from "../../components/PaymentPanel";
import styles from "../../styles/Detail.module.css";

function DatasetContent({ id }) {
  const [dataset, setDataset] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [dsRes, userRes] = await Promise.all([
          fetch(`/api/datasets/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }),
          fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!dsRes.ok) throw new Error(dsRes.status === 404 ? "资源不存在或已下架" : "资源加载失败，请重试");
        const [data, account] = await Promise.all([dsRes.json(), userRes.ok ? userRes.json() : null]);
        if (!controller.signal.aborted) { setDataset(data); setUser(account); setError(""); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || "网络异常，请重试");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [id, retry]);

  const refreshAccess = useCallback(async () => {
    const res = await fetch(`/api/datasets/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("下载信息刷新失败");
    const data = await res.json();
    if (!data.isPaid) throw new Error("下载权限尚未更新");
    setDataset(data);
  }, [id]);

  if (loading) return <Layout title="加载中"><div className={styles.loadingBox} role="status">正在获取资源详情…</div></Layout>;
  if (!dataset) return (
    <Layout title="资源暂不可用"><div className={styles.emptyBox}>
      <p role="alert">{error || "资源不存在"}</p>
      <button type="button" className={styles.checkBtn} onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>重新加载</button>
      <Link href="/" className={styles.backLink}>返回市集</Link>
    </div></Layout>
  );
  const tags = Array.isArray(dataset.tags) ? dataset.tags.filter(Boolean) : [];
  const free = Number(dataset.price) === 0;
  const downloadAvailable = typeof dataset.downloadUrl === "string" && /^https:\/\//i.test(dataset.downloadUrl);

  return (
    <Layout title={dataset.name}>
      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>← 返回市集</Link>
          <header className={styles.resourceHeader}>
            <span className={styles.resourceLabel}>数据资源</span>
            <h1 className={styles.title}>{dataset.name}</h1>
            {tags.length > 0 && <div className={styles.tagsRow}>{tags.map((tag) => <span key={tag} className={styles.tagBadge}>{tag}</span>)}</div>}
          </header>
          <div className={styles.contentGrid}>
            <div className={styles.leftCol}>
              <section className={styles.detailCard}>
                <h2 className={styles.cardHeader}>资源介绍</h2>
                {dataset.richContent ? (
                  <div className={styles.richContent} dangerouslySetInnerHTML={{ __html: dataset.richContent }} />
                ) : (
                  <p className={styles.richContent}>{dataset.description || "暂无介绍"}</p>
                )}
              </section>
            </div>
            <aside className={styles.rightCol} aria-label="购买与下载">
              <div className={styles.actionCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceLabel}>{free ? "免费资源" : dataset.isPaid ? "资源权限" : "一次购买，解锁下载"}</span>
                  <div className={`${styles.priceValue} ${dataset.isPaid ? styles.priceUnlocked : ""}`}>
                    {free ? "免费" : dataset.isPaid ? "已解锁" : `¥${Number(dataset.price).toFixed(2)}`}
                  </div>
                </div>
                {dataset.isPaid ? (
                  downloadAvailable ? <>
                    <p className={styles.unlockedHint}>{free ? "无需付款，可直接获取资源" : "已获得此资源，可直接下载"}</p>
                    <a href={dataset.downloadUrl} target="_blank" rel="noopener noreferrer" className={styles.downloadBtn}>前往下载</a>
                  </> : <p className={styles.paymentError}>下载链接暂不可用，请联系站点管理员</p>
                ) : <PaymentPanel dataset={dataset} user={user} onPaid={refreshAccess} />}
                <div className={styles.securityTip}>{dataset.isPaid ? "下载链接将在新窗口打开" : "由微信支付处理，付款确认后自动解锁"}</div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function DatasetDetail() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  if (!router.isReady || !id) return <Layout title="加载中"><div className={styles.loadingBox} role="status">正在获取资源详情…</div></Layout>;
  // A route change must discard old payment state and abort its requests.
  return <DatasetContent key={id} id={id} />;
}
