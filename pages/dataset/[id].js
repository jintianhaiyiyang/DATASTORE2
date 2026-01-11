// pages/dataset/[id].js 简化版
import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../../components/Layout";
import { QRCodeSVG } from "qrcode.react"; 
import styles from "../../styles/Detail.module.css";

export default function DatasetDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [dataset, setDataset] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [wxQrCode, setWxQrCode] = useState(""); 
  const [showWxModal, setShowWxModal] = useState(false);
  const pollingTimer = useRef(null);

  const fetchData = async () => {
    if (!id) return;
    try {
      const [dsRes, userRes] = await Promise.all([
        fetch(`/api/datasets/${id}`),
        fetch("/api/auth/me")
      ]);
      if (dsRes.ok) setDataset(await dsRes.json());
      if (userRes.ok) setUser(await userRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    return () => { if (pollingTimer.current) clearInterval(pollingTimer.current); };
  }, [id]);

  const handleBuy = async () => {
    if (!user || !user.isLoggedIn) {
      alert("请先登录"); router.push("/login"); return;
    }
    setIsPaying(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: id, paymentMethod: "wechat" }), // 固定微信
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      if (data.type === "qrcode") {
        setWxQrCode(data.codeUrl);
        setShowWxModal(true);
        startPolling(data.outTradeNo);
      }
    } catch (e) { alert(e.message); } finally { setIsPaying(false); }
  };

  const startPolling = (outTradeNo) => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-order?orderId=${outTradeNo}`);
        const data = await res.json();
        if (data.paid) {
          clearInterval(pollingTimer.current);
          setShowWxModal(false);
          alert("🎉 支付成功！");
          fetchData(); 
        }
      } catch (err) { console.error(err); }
    }, 2000);
  };

  if (loading) return <Layout title="加载中...">加载中...</Layout>;
  if (!dataset) return <Layout title="404">资源不存在</Layout>;

  return (
    <Layout title={dataset.name}>
      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>← 返回首页</Link>
          <div className={styles.contentGrid}>
            <div className={styles.leftCol}>
              <h1 className={styles.title}>{dataset.name}</h1>
              <div className={styles.detailCard}>
                <h3 className={styles.cardHeader}>资源详情</h3>
                <div className={styles.richContent} dangerouslySetInnerHTML={{ __html: dataset.richContent || dataset.description }} />
              </div>
            </div>
            <div className={styles.rightCol}>
              <div className={styles.actionCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceLabel}>价格</span>
                  <div className={styles.priceValue}>{dataset.isPaid ? "已解锁" : `¥${dataset.price}`}</div>
                </div>
                {dataset.isPaid ? (
                  <a href={dataset.downloadUrl} target="_blank" className={styles.downloadBtn}>前往网盘下载</a>
                ) : (
                  <button onClick={handleBuy} disabled={isPaying} className={styles.wechatBtn}>
                    {isPaying ? "正在初始化..." : "微信扫码支付"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWxModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWxModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>微信支付</h3>
            <div className={styles.qrWrapper}><QRCodeSVG value={wxQrCode} size={200} /></div>
            <p className={styles.modalTip}>扫码后请勿关闭此窗口</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
