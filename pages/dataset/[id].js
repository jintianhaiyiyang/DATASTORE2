import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import PaymentPanel from "../../components/PaymentPanel";
import DeliveryDialog from "../../components/DeliveryDialog";
import styles from "../../styles/Detail.module.css";

// What the buyer received. orderId narrows a stock product to that order.
function deliveryEntries(dataset, orderId) {
  if (dataset?.category !== "digital") return [];
  if (dataset.deliveryMode === "stock") {
    const all = Array.isArray(dataset.deliveries) ? dataset.deliveries : [];
    const list = orderId ? all.filter((entry) => entry.orderId === orderId) : all;
    return list.map((entry, index) => ({
      key: entry.orderId,
      label: list.length > 1 ? `第 ${list.length - index} 次购买` : "订单内容",
      text: entry.item,
      pending: entry.pending,
      time: entry.deliveredAt || entry.paidAt,
    }));
  }
  if (!dataset.isPaid) return [];
  const entries = [];
  if (dataset.deliveryContent) entries.push({ key: "content", text: dataset.deliveryContent });
  if (typeof dataset.downloadUrl === "string" && /^https:\/\//i.test(dataset.downloadUrl)) {
    entries.push({ key: "link", label: "下载链接", text: dataset.downloadUrl });
  }
  return entries;
}

function DatasetContent({ id }) {
  const router = useRouter();
  const [dataset, setDataset] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const autoOpened = useRef(false);
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

  const refreshAccess = useCallback(async (orderId) => {
    const res = await fetch(`/api/datasets/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("下载信息刷新失败");
    const data = await res.json();
    if (!data.isPaid) throw new Error("下载权限尚未更新");
    setDataset(data);
    const entries = deliveryEntries(data, typeof orderId === "string" ? orderId : "");
    if (entries.length) setDelivery({ entries, title: "购买成功" });
  }, [id]);

  // Returning from a cashier (USDT, Alipay) with ?payOrder=… opens the
  // purchased content once the order shows as delivered.
  const returnedOrder = typeof router.query.payOrder === "string" ? router.query.payOrder : "";
  useEffect(() => {
    if (autoOpened.current || !dataset || !returnedOrder) return;
    const entries = dataset.deliveryMode === "stock"
      ? deliveryEntries(dataset, returnedOrder)
      : deliveryEntries(dataset);
    if (!entries.length) return;
    autoOpened.current = true;
    const timer = setTimeout(() => setDelivery({ entries, title: "购买成功" }), 0);
    return () => clearTimeout(timer);
  }, [dataset, returnedOrder]);

  const closeDelivery = useCallback(() => {
    setDelivery(null);
    if (router.query.payOrder) {
      const { payOrder: _order, ...query } = router.query;
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
    }
  }, [router]);

  if (loading) return <Layout title="加载中"><div className={styles.loadingBox} role="status">正在获取资源详情…</div></Layout>;
  if (!dataset) return (
    <Layout title="资源暂不可用"><div className={styles.emptyBox}>
      <h1 className={styles.emptyTitle}>资源暂不可用</h1>
      <p role="alert">{error || "资源不存在"}</p>
      <div className={styles.emptyActions}>
        <button type="button" className={styles.checkBtn} onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>重新加载</button>
        <Link href="/" className={styles.backLink}>← 返回市集</Link>
      </div>
    </div></Layout>
  );
  const tags = Array.isArray(dataset.tags) ? dataset.tags.filter(Boolean) : [];
  const free = Number(dataset.price) === 0;
  const downloadAvailable = typeof dataset.downloadUrl === "string" && /^https:\/\//i.test(dataset.downloadUrl);
  const digital = dataset.category === "digital";
  const stockMode = digital && dataset.deliveryMode === "stock";
  const stockCount = Number(dataset.stockCount) || 0;
  const purchasedEntries = deliveryEntries(dataset);
  const openPurchased = () => setDelivery({ entries: purchasedEntries, title: "已购内容" });
  const price = `¥${Number(dataset.price).toFixed(2)}`;

  let priceLabel = free ? "免费资源" : dataset.isPaid ? "资源权限" : "一次购买，解锁下载";
  let priceText = free ? "免费" : dataset.isPaid ? "已解锁" : price;
  if (digital) {
    priceLabel = stockMode ? `单价 · ${stockCount > 0 ? `库存 ${stockCount}` : "已售罄"}`
      : free ? "免费领取" : dataset.isPaid ? "已购买" : "付款后立即发货";
    priceText = stockMode ? price : free ? "免费" : dataset.isPaid ? "已购买" : price;
  }
  const unlocked = digital ? !stockMode && dataset.isPaid : dataset.isPaid;

  let action;
  if (stockMode) {
    action = <>
      {purchasedEntries.length > 0 && <button type="button" className={`${styles.secondaryPayBtn} ${styles.purchasedBtn}`} onClick={openPurchased}>
        查看已购内容（{purchasedEntries.length}）
      </button>}
      <PaymentPanel dataset={dataset} user={user} onPaid={refreshAccess} soldOut={stockCount < 1} />
    </>;
  } else if (digital && dataset.isPaid) {
    action = purchasedEntries.length > 0 ? <>
      <p className={styles.unlockedHint}>{free ? "无需付款，可直接查看" : "已购买，可随时查看"}</p>
      <button type="button" className={styles.downloadBtn} onClick={openPurchased}>查看已购内容</button>
    </> : <p className={styles.paymentError}>购买内容暂不可用，请联系站点管理员</p>;
  } else if (dataset.isPaid) {
    action = downloadAvailable ? <>
      <p className={styles.unlockedHint}>{free ? "无需付款，可直接获取资源" : "已获得此资源，可直接下载"}</p>
      <a href={dataset.downloadUrl} target="_blank" rel="noopener noreferrer" className={styles.downloadBtn}>前往下载</a>
    </> : <p className={styles.paymentError}>下载链接暂不可用，请联系站点管理员</p>;
  } else {
    action = <PaymentPanel dataset={dataset} user={user} onPaid={refreshAccess} />;
  }

  const tip = digital
    ? stockMode ? "每次购买发放一份，付款后弹窗显示，可重复购买" : dataset.isPaid ? "内容仅对已购买账号可见" : "付款后弹窗显示购买内容，请勿重复付款"
    : dataset.isPaid ? "下载链接将在新窗口打开" : "付款确认后自动解锁，请勿重复付款";

  return (
    <Layout title={dataset.name}>
      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>← 返回市集</Link>
          <header className={styles.resourceHeader}>
            <span className={styles.resourceLabel}>{digital ? "数字商品" : "数据资源"}</span>
            <h1 className={styles.title}>{dataset.name}</h1>
            {tags.length > 0 && <div className={styles.tagsRow}>{tags.map((tag) => <span key={tag} className={styles.tagBadge}>{tag}</span>)}</div>}
          </header>
          <div className={styles.contentGrid}>
            <div className={styles.leftCol}>
              <section className={styles.detailCard}>
                <h2 className={styles.cardHeader}>{digital ? "商品介绍" : "资源介绍"}</h2>
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
                  <span className={styles.priceLabel}>{priceLabel}</span>
                  <div className={`${styles.priceValue} ${unlocked ? styles.priceUnlocked : ""}`}>{priceText}</div>
                </div>
                {action}
                <div className={styles.securityTip}>{tip}</div>
              </div>
            </aside>
          </div>
        </div>
      </div>
      {delivery && <DeliveryDialog name={dataset.name} title={delivery.title} entries={delivery.entries} onClose={closeDelivery} />}
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
