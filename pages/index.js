import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../components/Layout";
import Fuse from "fuse.js";
// 我们直接在组件内写样式，保证复制过去就能用，不再依赖外部 css
import { useRouter } from "next/router";

// 核心视觉：四色柱状图大图标 (Hero 区域专用)
const HeroLogo = () => (
  <svg width="120" height="120" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.1))'}}>
    <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#EF4444" />
    <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#F59E0B" />
    <rect x="18" y="4" width="6" height="26" rx="1.5" fill="#10B981" />
    <rect x="26" y="0" width="6" height="30" rx="1.5" fill="#2563EB" />
  </svg>
);

export default function HomePage() {
  const [articles, setArticles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [articleFuse, setArticleFuse] = useState(null);
  const [datasetFuse, setDatasetFuse] = useState(null);

  // 1. 获取数据 
  useEffect(() => {
    Promise.all([
      fetch("/api/articles").then((res) => res.json()).catch(() => []),
      fetch("/api/datasets").then((res) => res.json()).catch(() => []),
    ]).then(([articlesData, datasetsData]) => {
      setArticles(Array.isArray(articlesData) ? articlesData : []);
      setDatasets(Array.isArray(datasetsData) ? datasetsData : []);
    });
  }, []);

  // 2. 初始化搜索索引
  useEffect(() => {
    if (articles.length > 0) {
      setArticleFuse(new Fuse(articles, { keys: ["title", "summary"], threshold: 0.35 }));
    }
    if (datasets.length > 0) {
      setDatasetFuse(new Fuse(datasets, { keys: ["name", "description"], threshold: 0.35 }));
    }
  }, [articles, datasets]);

  // 3. 执行搜索
  const filteredArticles = useMemo(() => {
    if (!query) return articles;
    return articleFuse ? articleFuse.search(query).map(r => r.item) : [];
  }, [query, articleFuse, articles]);

  const filteredDatasets = useMemo(() => {
    if (!query) return datasets;
    return datasetFuse ? datasetFuse.search(query).map(r => r.item) : [];
  }, [query, datasetFuse, datasets]);

  const totalCount = filteredArticles.length + filteredDatasets.length;

  return (
    <Layout title="数据小商店 - 首页">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      
      {/* 全局深色背景容器 */}
      <div style={{ backgroundColor: '#111827', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif' }}>
        
        {/* Hero 区域 */}
        <section style={{ 
          textAlign: 'center', 
          padding: '80px 20px', 
          background: 'radial-gradient(circle at center, #1F2937 0%, #111827 100%)' 
        }}>
          <div style={{ marginBottom: '30px' }}><HeroLogo /></div>
          <h1 style={{ 
            fontSize: '3.5rem', 
            fontWeight: '800', 
            marginBottom: '16px', 
            background: 'linear-gradient(to right, #60A5FA, #A78BFA)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent' 
          }}>
            数据小商店
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            精选行业数据集与深度分析文章，赋能商业决策
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginTop: '40px', color: '#D1D5DB' }}>
            <div><strong style={{fontSize: '24px', color: 'white'}}>{articles.length}</strong> 篇深度文章</div>
            <div style={{width: '1px', background: '#374151'}}></div>
            <div><strong style={{fontSize: '24px', color: 'white'}}>{datasets.length}</strong> 个数据集</div>
          </div>
        </section>

        {/* 搜索与 Tab 栏 (吸顶效果) */}
        <section style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(17, 24, 39, 0.95)', backdropFilter: 'blur(10px)', padding: '20px 0', borderBottom: '1px solid #374151' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
            <input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="🔍 搜索文章关键词或数据集名称..."
              style={{
                width: '100%',
                padding: '16px 24px',
                borderRadius: '50px',
                border: '1px solid #4B5563',
                background: '#1F2937',
                color: 'white',
                fontSize: '16px',
                outline: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
              {[
                { key: "all", label: "全部资源" },
                { key: "article", label: "文章分析" },
                { key: "dataset", label: "原始数据" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '20px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    background: activeTab === tab.key ? '#2563EB' : '#374151',
                    color: activeTab === tab.key ? 'white' : '#9CA3AF',
                    transition: 'all 0.2s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            {query && <div style={{textAlign: 'center', marginTop: '10px', color: '#9CA3AF', fontSize: '12px'}}>
              搜索结果：共 {totalCount} 条
            </div>}
          </div>
        </section>

        {/* 主要内容区域 */}
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
          
          {/* 文章列表 */}
          {(activeTab === "all" || activeTab === "article") && filteredArticles.length > 0 && (
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '24px', borderLeft: '4px solid #F59E0B', paddingLeft: '12px' }}>精选文章</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {filteredArticles.map((a) => (
                  <Link href={`/article/${a.id}`} key={a.id} style={{textDecoration: 'none'}}>
                    <div style={{ background: '#1F2937', borderRadius: '16px', padding: '24px', height: '100%', border: '1px solid #374151', transition: 'transform 0.2s' }}
                         onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                         onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                      <div style={{ marginBottom: '12px', fontSize: '20px' }}>📄</div>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>{a.title}</h3>
                      <p style={{ color: '#9CA3AF', fontSize: '14px', lineHeight: '1.6' }}>{a.summary || '暂无摘要'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 数据集列表 */}
          {(activeTab === "all" || activeTab === "dataset") && filteredDatasets.length > 0 && (
            <section>
              <h2 style={{ fontSize: '24px', marginBottom: '24px', borderLeft: '4px solid #10B981', paddingLeft: '12px' }}>数据集市</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {filteredDatasets.map((d) => (
                  <Link href={`/dataset/${d.id}`} key={d.id} style={{textDecoration: 'none'}}>
                    <div style={{ background: '#1F2937', borderRadius: '16px', padding: '24px', height: '100%', border: '1px solid #374151', position: 'relative', transition: 'transform 0.2s' }}
                         onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                         onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                        <div style={{ background: '#065F46', color: '#6EE7B7', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>DATA</div>
                        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>¥{d.price}</span>
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>{d.name}</h3>
                      <p style={{ color: '#9CA3AF', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>{d.description}</p>
                      <div style={{ color: '#60A5FA', fontSize: '14px', fontWeight: 'bold' }}>立即查看 →</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          
          {totalCount === 0 && (
             <div style={{ textAlign: 'center', padding: '60px', color: '#6B7280' }}>
               <p style={{ fontSize: '18px' }}>🔍 没有找到相关资源，请尝试其他关键词</p>
             </div>
          )}
        </main>
      </div>
    </Layout>
  );
}
