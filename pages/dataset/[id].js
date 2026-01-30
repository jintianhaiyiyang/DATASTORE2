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

  // 3. 轮询函数：每 2 秒检查一次订单状态
  const startPolling = (outTradeNo) => {
    // 如果已有定时器先清除
    if (pollingTimer.current) clearInterval(pollingTimer.current);

    pollingTimer.current = setInterval(async () => {
      try {
        // 🟢 关键：添加 t=${Date.now()} 参数，强制浏览器不走缓存 (解决 304 问题)
        const res = await fetch(`/api/check-order?orderId=${outTradeNo}&t=${Date.now()}`);
        const data = await res.json();

        // 如果后端确认已支付
        if (data.paid) {
          clearInterval(pollingTimer.current); // 停止轮询
          setShowWxModal(false); // 关闭弹窗
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("pendingOrderId");
          }
          alert("🎉 支付成功！页面即将刷新...");
          
          // 🟢 使用 window.location.reload() 彻底刷新页面，确保拿到最新的“已解锁”状态
          window.location.reload(); 
        }
      } catch (err) {
        console.error("查询订单状态出错:", err);
      }
    }, 2000); // 每 2 秒一次
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

  if (loading) return <Layout title="加载中...">正在获取资源详情...</Layout>;
  if (!dataset) return <Layout title="404">资源不存在</Layout>;

  return (
    <Layout title={`${dataset.name} - DATA STORE`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* ⬇️ 使用 styles.mainWrapper 包裹，恢复深色背景 */}
      <div className={styles.mainWrapper}>
        <div className={styles.container}>
          
          <Link href="/" className={styles.backLink}>
            ← 返回数据市集
          </Link>

          <div className={styles.contentGrid}>
            
            {/* 左侧：详情展示区 */}
            <div className={styles.leftCol}>
              <h1 className={styles.title}>{dataset.name}</h1>
              <div className={styles.tagsRow}>
                {/* 模拟标签 */}
                <span className={styles.tagBadge}>数据分析</span>
                <span className={styles.tagBadge}>2024</span>
                <span className={styles.tagBadge}>热门</span>
              </div>
              
              <div className={styles.detailCard}>
                <h3 className={styles.cardHeader}>资源图文介绍</h3>
                {/* 渲染图文内容 */}
                <div 
                  className={styles.richContent}
                  dangerouslySetInnerHTML={{ __html: dataset.richContent || dataset.description }} 
                />
              </div>
            </div>

            {/* 右侧：操作区 (Sticky 悬浮) */}
            <div className={styles.rightCol}>
              <div className={styles.actionCard}>
                <div className={styles.priceSection}>
                  <span className={styles.priceLabel}>资源定价</span>
                  <div className={styles.priceValue}>
                    {dataset.isPaid ? "已解锁" : `¥${dataset.price}`}
                  </div>
                </div>

                {dataset.isPaid ? (
                  // ✅ 只有支付成功并刷新后，才会显示这个下载按钮
                  <div className={styles.unlockedArea}>
                    <p style={{color: '#10B981', marginBottom: '10px', fontWeight: 'bold'}}>✅ 您已获得此资源</p>
                    <a 
                      href={dataset.downloadUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className={styles.downloadBtn}
                    >
                      立即前往网盘下载
                    </a>
                  </div>
                ) : (
                  // ✅ 未支付显示微信按钮
                  <div className={styles.payButtonGroup}>
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
                  🛡️ 支付后自动解锁下载链接
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 微信支付模态框 */}
      {showWxModal && (
        <div className={styles.modalOverlay} onClick={closeWxModal}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>微信扫码支付</h3>
            <div className={styles.qrWrapper}>
              {/* 二维码显示区域 */}
              <QRCodeSVG value={wxQrCode} size={220} />
            </div>
            <p className={styles.modalTip}>
              请使用微信“扫一扫”<br/>
              支付成功后页面将自动跳转
            </p>
            <button className={styles.modalCloseBtn} onClick={closeWxModal}>
              取消支付
            </button>
          </div>
        </div>
      )}

      {/* 补充全局样式修复，防止图片溢出 */}
      <style jsx global>{`
        .${styles.richContent} img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          margin: 20px 0;
        }
      `}</style>
    </Layout>
  );
}
