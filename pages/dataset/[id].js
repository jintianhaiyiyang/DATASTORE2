import { useRouter } from "next/router";
import { useEffect, useState, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../../components/Layout";
import { QRCodeSVG } from "qrcode.react"; 
// ⬇️ 关键：必须引入样式文件以恢复“黑金”外观
import styles from "../../styles/Detail.module.css";

export default function DatasetDetail() {
  const router = useRouter();
  const { id } = router.query;
  
  // 状态管理
  const [dataset, setDataset] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // 支付相关状态
  const [isPaying, setIsPaying] = useState(false);
  const [wxQrCode, setWxQrCode] = useState(""); 
  const [showWxModal, setShowWxModal] = useState(false);
  const [paymentClientType, setPaymentClientType] = useState("native");
  
  // 轮询定时器引用
  const pollingTimer = useRef(null);

  const getPaymentClientType = () => {
    if (typeof navigator === "undefined") return "native";
    const ua = navigator.userAgent || "";
    const isWeChat = /MicroMessenger/i.test(ua);
    const isIpad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isMobile = /Android|iPhone|iPod/i.test(ua) || isIpad;
    if (isWeChat) return "jsapi";
    if (isMobile) return "h5";
    return "native";
  };

  const payButtonLabel = paymentClientType === "h5" ? "微信支付" : "微信扫码支付";

  // 1. 初始化：获取数据集详情及用户信息
  const fetchData = async () => {
    if (!id) return;
    try {
      const [dsRes, userRes] = await Promise.all([
        fetch(`/api/datasets/${id}`),
        fetch("/api/auth/me")
      ]);
      
      if (dsRes.ok) setDataset(await dsRes.json());
      if (userRes.ok) setUser(await userRes.json());
    } catch (e) {
      console.error("加载详情失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (router.isReady) {
      fetchData();
    }
    // 组件卸载时清除定时器，防止内存泄漏
    return () => {
      if (pollingTimer.current) clearInterval(pollingTimer.current);
    };
  }, [id, router.isReady]);

  useEffect(() => {
    setPaymentClientType(getPaymentClientType());
  }, []);

  // 2. 核心支付逻辑 (只保留微信)

  const invokeWeChatPay = (payParams, outTradeNo) => {
    if (typeof window === "undefined") return;
    const doInvoke = () => {
      if (!window.WeixinJSBridge) {
        alert("请在微信内打开完成支付");
        return;
      }
      window.WeixinJSBridge.invoke(
        "getBrandWCPayRequest",
        payParams,
        (res) => {
          if (res.err_msg === "get_brand_wcpay_request:ok") {
            startPolling(outTradeNo);
          } else if (res.err_msg === "get_brand_wcpay_request:cancel") {
            alert("已取消支付");
          } else {
            alert("支付未完成，请重试");
          }
        }
      );
    };

    if (window.WeixinJSBridge) {
      doInvoke();
    } else if (document.addEventListener) {
      document.addEventListener("WeixinJSBridgeReady", doInvoke, false);
    } else if (document.attachEvent) {
      document.attachEvent("WeixinJSBridgeReady", doInvoke);
      document.attachEvent("onWeixinJSBridgeReady", doInvoke);
    }
  };
  const handleBuy = async () => {
    // 强制登录检查
    if (!user || !user.isLoggedIn) {
      alert("请先登录后再进行购买");
      router.push("/login");
      return;
    }

    setIsPaying(true);
    try {
      // 发起支付请求
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 固定使用 wechat 支付方式
        body: JSON.stringify({ datasetId: id, paymentMethod: "wechat", clientType: paymentClientType }),
      });
      const data = await res.json();


      if (data.needOauth) {
        if (typeof window !== "undefined") {
          const redirectUrl = window.location.href.split("#")[0];
          window.location.href = `/api/wechat/oauth/start?redirect=${encodeURIComponent(redirectUrl)}`;
          return;
        }
      }

      if (!res.ok) throw new Error(data.message || "初始化支付失败");

      if (data.type === "jsapi") {
        if (!data.payParams) throw new Error("支付参数缺失");
        invokeWeChatPay(data.payParams, data.outTradeNo);
        return;
      }

      if (data.outTradeNo && typeof window !== "undefined") {
        window.localStorage.setItem("pendingOrderId", data.outTradeNo);
      }

      if (data.type === "h5") {
        if (!data.mwebUrl) throw new Error("支付链接为空");
        if (typeof window !== "undefined") {
          const redirectUrl = window.location.href.split("#")[0];
          const hasRedirect = /[?&]redirect_url=/.test(data.mwebUrl);
          const separator = data.mwebUrl.includes("?") ? "&" : "?";
          const jumpUrl = hasRedirect ? data.mwebUrl : `${data.mwebUrl}${separator}redirect_url=${encodeURIComponent(redirectUrl)}`;
          window.location.href = jumpUrl;
          return;
        }
      }

      if (data.type === "qrcode") {
        setWxQrCode(data.codeUrl);
        setShowWxModal(true);

        // 🟢 拿到订单号，立即开始轮询查单
        startPolling(data.outTradeNo);
      }
    } catch (e) {
      alert("支付错误: " + e.message);
    } finally {
      setIsPaying(false);
    }
  };

  // 3. 轮询函数：每 2 秒检查一次订单状态，最多约 5 分钟
  const startPolling = (outTradeNo) => {
    if (!outTradeNo) return;
    if (pollingTimer.current) clearInterval(pollingTimer.current);

    let attempts = 0;
    const maxAttempts = 150; // 150 * 2s ≈ 5 min

    pollingTimer.current = setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
        return;
      }
      try {
        const res = await fetch(`/api/check-order?orderId=${encodeURIComponent(outTradeNo)}&t=${Date.now()}`);
        const data = await res.json();

        if (data.paid) {
          clearInterval(pollingTimer.current);
          pollingTimer.current = null;
          setShowWxModal(false);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("pendingOrderId");
          }
          alert("🎉 支付成功！页面即将刷新...");
          window.location.reload();
        }
      } catch (err) {
        console.error("查询订单状态出错:", err);
      }
    }, 2000);
  };

  useEffect(() => {
    if (!dataset || dataset.isPaid) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("pendingOrderId");
      }
      return;
    }
    if (typeof window === "undefined") return;
    const pendingOrderId = window.localStorage.getItem("pendingOrderId");
    if (pendingOrderId) {
      startPolling(pendingOrderId);
    }
  }, [dataset]);

  // 4. 关闭弹窗并清理轮询
  const closeWxModal = () => {
    setShowWxModal(false);
    if (pollingTimer.current) clearInterval(pollingTimer.current);
  };

  if (loading) {
    return (
      <Layout title="加载中...">
        <div className={styles.loadingBox}>正在获取资源详情...</div>
      </Layout>
    );
  }
  if (!dataset) {
    return (
      <Layout title="404">
        <div className={styles.emptyBox}>资源不存在</div>
      </Layout>
    );
  }

  const tags = Array.isArray(dataset.tags) ? dataset.tags.filter(Boolean) : [];

  return (
    <Layout title={dataset.name}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>
            ← 返回市集
          </Link>

          <div className={styles.contentGrid}>
            <div className={styles.leftCol}>
              <h1 className={styles.title}>{dataset.name}</h1>
              {tags.length > 0 && (
                <div className={styles.tagsRow}>
                  {tags.map((tag, i) => (
                    <span key={i} className={styles.tagBadge}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.detailCard}>
                <h3 className={styles.cardHeader}>资源介绍</h3>
                <div
                  className={styles.richContent}
                  dangerouslySetInnerHTML={{
                    __html: dataset.richContent || dataset.description || "暂无介绍",
                  }}
                />
              </div>
            </div>

            <div className={styles.rightCol}>
              <div className={styles.actionCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceLabel}>价格</span>
                  <div
                    className={`${styles.priceValue} ${
                      dataset.isPaid ? styles.priceUnlocked : ""
                    }`}
                  >
                    {dataset.isPaid
                      ? "已解锁"
                      : Number(dataset.price) === 0
                        ? "免费"
                        : `¥${dataset.price}`}
                  </div>
                </div>

                {dataset.isPaid ? (
                  <div>
                    <p className={styles.unlockedHint}>已获得此资源，可直接下载</p>
                    <a
                      href={dataset.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.downloadBtn}
                    >
                      前往下载
                    </a>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={handleBuy}
                      disabled={isPaying}
                      className={styles.wechatBtn}
                    >
                      {isPaying ? "正在创建订单..." : payButtonLabel}
                    </button>
                  </div>
                )}

                <div className={styles.securityTip}>
                  支付成功后自动解锁下载链接
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWxModal && (
        <div className={styles.modalOverlay} onClick={closeWxModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>微信扫码支付</h3>
            <div className={styles.qrWrapper}>
              <QRCodeSVG value={wxQrCode} size={200} />
            </div>
            <p className={styles.modalTip}>
              请使用微信扫一扫完成支付
              <br />
              支付成功后页面将自动刷新
            </p>
            <button type="button" className={styles.modalCloseBtn} onClick={closeWxModal}>
              取消
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
