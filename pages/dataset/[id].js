import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../../components/Layout";
import { QRCodeSVG } from "qrcode.react"; 
// ⬇️ 关键：必须引入刚才保存的 CSS 文件
import styles from "../../styles/Detail.module.css";

export default function DatasetDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [dataset, setDataset] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 支付相关状态
  const [isPaying, setIsPaying] = useState(false);
  const [wxQrCode, setWxQrCode] = useState(""); 
  const [showWxModal, setShowWxModal] = useState(false);
  const pollingTimer = useRef(null);

  // 1. 获取数据
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

  // 2. 处理购买 (固定为微信)
  const handleBuy = async () => {
    if (!user || !user.isLoggedIn) {
      alert("请先登录"); router.push("/login"); return;
    }
    setIsPaying(true);
    try {
      // 固定发送 paymentMethod: "wechat"
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: id, paymentMethod: "wechat" }), 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "支付请求失败");

      if (data.type === "qrcode") {
        setWxQrCode(data.codeUrl);
        setShowWxModal(true);
        // 开始轮询
        startPolling(data.outTradeNo);
      }
    } catch (e) { alert(e.message); } finally { setIsPaying(false); }
  };

  // 3. 轮询查单
  const startPolling = (outTradeNo) => {
    if (pollingTimer.current) clearInterval(pollingTimer.current);
    pollingTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-order?orderId=${outTradeNo}`);
        const data = await res.json();
        if (data.paid) {
          clearInterval(pollingTimer.current);
          setShowWxModal(false);
          alert("🎉 支付成功！页面即将刷新...");
          fetchData(); // 刷新数据以显示下载按钮
        }
      } catch (err) { console.error(err); }
    }, 2000);
  };

  if (loading) return <Layout title="加载中...">加载中...</Layout>;
  if (!dataset) return <Layout title="404">资源不存在</Layout>;

  return (
    <Layout title={dataset.name}>
      {/* ⬇️ 使用 styles.mainWrapper 包裹整个页面 */}
      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          
          <Link href="/" className={styles.backLink}>← 返回首页</Link>

          <div className={styles.contentGrid}>
            
            {/* 左侧详情区 */}
            <div className={styles.leftCol}>
              <h1 className={styles.title}>{dataset.name}</h1>
              <div className={styles.detailCard}>
                <h3 className={styles.cardHeader}>资源图文介绍</h3>
                {/* 渲染带样式的图文内容 */}
                <div className={styles.richContent} dangerouslySetInnerHTML={{ __html: dataset.richContent || dataset.description }} />
              </div>
            </div>

            {/* 右侧操作区 (已移除支付宝) */}
            <div className={styles.rightCol}>
              <div className={styles.actionCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceLabel}>资源定价</span>
                  <div className={styles.priceValue}>
                    {dataset.isPaid ? "已解锁" : `¥${dataset.price}`}
                  </div>
                </div>

                {dataset.isPaid ? (
                  <a href={dataset.downloadUrl} target="_blank" className={styles.downloadBtn}>
                    立即前往网盘下载
                  </a>
                ) : (
                  // ⬇️ 只有一个微信支付按钮了
                  <button 
                    onClick={handleBuy} 
                    disabled={isPaying} 
                    className={styles.wechatBtn}
                  >
                    {isPaying ? "正在创建订单..." : "微信扫码支付"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 微信支付弹窗 */}
      {showWxModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWxModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>微信扫码支付</h3>
            <div className={styles.qrWrapper}>
              <QRCodeSVG value={wxQrCode} size={220} />
            </div>
            <p className={styles.modalTip}>支付成功后将在几秒内自动跳转</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
