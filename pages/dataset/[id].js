import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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
  
  // 支付相关状态
  const [isPaying, setIsPaying] = useState(false);
  const [wxQrCode, setWxQrCode] = useState(""); 
  const [showWxModal, setShowWxModal] = useState(false);

  // 1. 获取详情和权限状态
  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const [dsRes, userRes] = await Promise.all([
          // 注意：此处后端应有对应的 /api/datasets/[id].js 接口
          fetch(`/api/datasets/${id}`), 
          fetch("/api/auth/me")
        ]);
        
        if (dsRes.ok) setDataset(await dsRes.json());
        if (userRes.ok) setUser(await userRes.json());
      } catch (e) {
        console.error("加载数据失败", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // 2. 支付逻辑调用
  const handleBuy = async (method) => {
    if (!user || !user.isAuthenticated) {
      alert("请先登录后再购买");
      router.push("/login");
      return;
    }

    setIsPaying(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: id, paymentMethod: method }),
      });
      const data = await res.json();

      if (data.type === "url") {
        window.location.href = data.url; // 支付宝/Stripe 跳转
      } else if (data.type === "qrcode") {
        setWxQrCode(data.codeUrl); // 微信显示二维码
        setShowWxModal(true);
      }
    } catch (e) {
      alert("网络错误，请稍后重试");
    } finally {
      setIsPaying(false);
    }
  };

  if (loading) return <Layout title="加载中...">正在获取详情...</Layout>;
  if (!dataset) return <Layout title="未找到">资源不存在</Layout>;

  return (
    <Layout title={`${dataset.name} - DATA STORE`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div style={{ backgroundColor: '#111827', minHeight: '100vh', color: '#fff' }}>
        <div className={styles.container} style={{ paddingTop: '40px', paddingBottom: '80px', maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }}>
          
          <Link href="/" style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '30px', display: 'block' }}>
            ← 返回市集
          </Link>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '40px' }} className="responsive-grid">
            
            {/* 左侧：图文详情区 */}
            <div>
              <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '24px' }}>{dataset.name}</h1>
              
              <div style={{ background: '#1F2937', padding: '30px', borderRadius: '16px', border: '1px solid #374151' }}>
                <h3 style={{ color: '#fff', marginBottom: '20px', borderLeft: '4px solid #2563EB', paddingLeft: '12px' }}>
                  资源图文介绍
                </h3>
                
                {/* 关键：渲染图文并茂的 HTML 内容 */}
                <div 
                  className="rich-content"
                  style={{ lineHeight: '1.8', color: '#D1D5DB' }}
                  dangerouslySetInnerHTML={{ __html: dataset.richContent || dataset.description }} 
                />
              </div>
            </div>

            {/* 右侧：固定位置的支付卡片 */}
            <div style={{ position: 'sticky', top: '100px', height: 'fit-content' }}>
              <div style={{ background: '#1F2937', padding: '32px', borderRadius: '20px', border: '1px solid #374151' }}>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ color: '#9CA3AF', fontSize: '14px' }}>获取资源</div>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: '#F59E0B', marginTop: '8px' }}>
                    {dataset.isPaid ? "已解锁" : `¥${dataset.price}`}
                  </div>
                </div>

                {dataset.isPaid ? (
                  <a href={dataset.downloadUrl} target="_blank" rel="noreferrer" 
                     style={{ display: 'block', textAlign: 'center', background: '#2563EB', color: '#fff', padding: '16px', borderRadius: '12px', fontWeight: '700', textDecoration: 'none' }}>
                    立即前往网盘下载
                  </a>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button onClick={() => handleBuy('alipay')} disabled={isPaying} style={{ background: '#00A1E9', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>支付宝支付</button>
                    <button onClick={() => handleBuy('wechat')} disabled={isPaying} style={{ background: '#07C160', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>微信支付</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 微信支付弹窗 */}
      {showWxModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowWxModal(false)}>
          <div style={{ background: '#fff', padding: '40px', borderRadius: '24px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#111827', marginBottom: '20px' }}>微信扫码支付</h3>
            <QRCodeSVG value={wxQrCode} size={200} />
            <button style={{ marginTop: '30px', background: '#F3F4F6', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setShowWxModal(false)}>关闭</button>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          .responsive-grid { grid-template-columns: 1fr !important; }
        }
        /* 针对图文内容的图片样式优化 */
        .rich-content :global(img) {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 16px 0;
        }
      `}</style>
    </Layout>
  );
}