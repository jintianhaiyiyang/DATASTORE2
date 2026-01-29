import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../components/Layout";
import Fuse from "fuse.js";
import styles from "../styles/Home.module.css"; // 引入刚才的黑金样式
import { useSiteSettings } from "../lib/useSiteSettings";

// Hero 区域的四色图表 Logo
const HeroLogo = () => (
  <svg width="100" height="100" viewBox="0 0 32 32" fill="none" style={{filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.1))', marginBottom: '20px'}}>
    <rect x="4" y="16" width="4" height="14" rx="1" fill="#EF4444" />
    <rect x="10" y="10" width="4" height="20" rx="1" fill="#F59E0B" />
    <rect x="16" y="6" width="4" height="24" rx="1" fill="#10B981" />
    <rect x="22" y="2" width="4" height="28" rx="1" fill="#2563EB" />
  </svg>
);

export default function HomePage() {
  const siteSettings = useSiteSettings();
  const [articles, setArticles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [articleFuse, setArticleFuse] = useState(null);
  const [datasetFuse, setDatasetFuse] = useState(null);

  // 获取数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [artRes, dsRes] = await Promise.all([
          fetch("/api/articles"),
          fetch("/api/datasets")
        ]);
        const artData = await artRes.json();
        const dsData = await dsRes.json();
        setArticles(Array.isArray(artData) ? artData : []);
        setDatasets(Array.isArray(dsData) ? dsData : []);
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, []);

  // 初始化搜索
  useEffect(() => {
    if (articles.length > 0) setArticleFuse(new Fuse(articles, { keys: ["title", "summary"], threshold: 0.35 }));
    if (datasets.length > 0) setDatasetFuse(new Fuse(datasets, { keys: ["name", "description"], threshold: 0.35 }));
  }, [articles, datasets]);

  // 计算筛选结果
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
    <Layout title="DataStore - 数据小商店">
      <Head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></Head>
      
      <div className={styles.container}>
        
        {/* 顶部 Hero */}
        <section className={styles.heroSection}>
          {siteSettings.logoUrl ? (
            <img
              src={siteSettings.logoUrl}
              alt="logo"
              style={{ width: '96px', height: '96px', objectFit: 'contain', marginBottom: '20px' }}
            />
          ) : (
            <HeroLogo />
          )}
          <h1 className={styles.heroTitle}>{siteSettings.siteTitle || "DataStore"}</h1>
          <p className={styles.heroDesc}>
            连接高价值数据资产与深度商业洞察<br/>
            一站式数字资源交易平台
          </p>
          
          <div className={styles.statsRow}>
            <div className={styles.statItem}>
              <strong>{articles.length}</strong> 深度文章
            </div>
            <div className={styles.divider}></div>
            <div className={styles.statItem}>
              <strong>{datasets.length}</strong> 数据集
            </div>
          </div>
        </section>

        {/* 搜索吸顶条 */}
        <section className={styles.searchBarSticky}>
          <div className={styles.searchWrapper}>
            <input 
              className={styles.searchInput}
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="🔍 搜索感兴趣的资源..."
            />
            <div className={styles.tabs}>
              {[
                { key: "all", label: "全部资源" },
                { key: "dataset", label: "📊 数据集" },
                { key: "article", label: "📄 文章" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.tabBtn} ${activeTab === tab.key ? styles.tabBtnActive : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 列表内容 */}
        <main className={styles.main}>
          
          {/* 数据集列表 */}
          {(activeTab === "all" || activeTab === "dataset") && filteredDatasets.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle} style={{borderColor: '#10B981'}}>
                推荐数据集
              </h2>
              <div className={styles.grid}>
                {filteredDatasets.map((d) => (
                  <Link href={`/dataset/${d.id}`} key={d.id} className={styles.card}>
                    <div className={styles.cardBadgeRow}>
                      <span className={styles.badge} style={{background: '#065F46', color: '#6EE7B7'}}>DATA</span>
                      {/* 这里可以加热门标签逻辑 */}
                    </div>
                    <h3 className={styles.cardTitle}>{d.name}</h3>
                    <p className={styles.cardDesc}>{d.description}</p>
                    <div className={styles.cardFooter}>
                      <span className={styles.price}>
                        {Number(d.price) === 0 ? "免费" : `¥${d.price}`}
                      </span>
                      <span className={styles.action}>立即查看 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 文章列表 */}
          {(activeTab === "all" || activeTab === "article") && filteredArticles.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle} style={{borderColor: '#F59E0B'}}>
                精选洞察
              </h2>
              <div className={styles.grid}>
                {filteredArticles.map((a) => (
                  <Link href={`/article/${a.id}`} key={a.id} className={styles.card}>
                    <div className={styles.cardBadgeRow}>
                      <span className={styles.badge} style={{background: '#1E3A8A', color: '#93C5FD'}}>ARTICLE</span>
                    </div>
                    <h3 className={styles.cardTitle}>{a.title}</h3>
                    <p className={styles.cardDesc}>{a.summary || "暂无摘要..."}</p>
                    <div className={styles.cardFooter}>
                      <span style={{fontSize: '12px', color: '#6B7280'}}>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                      <span className={styles.action}>阅读全文 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {totalCount === 0 && (
            <div className={styles.emptyState}>
              <p>🔍 没有找到相关内容，请尝试其他关键词</p>
            </div>
          )}

        </main>

        {siteSettings.aboutContent && (
          <section id="about" className={styles.aboutSection}>
            <div className={styles.aboutCard}>
              <h2 className={styles.aboutTitle}>About Us</h2>
              <div
                className={styles.aboutContent}
                dangerouslySetInnerHTML={{ __html: siteSettings.aboutContent }}
              />
            </div>
          </section>
        )}

      </div>
    </Layout>
  );
}
