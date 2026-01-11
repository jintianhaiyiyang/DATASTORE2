import { useEffect, useState, useMemo } from "react";
import Head from "next/head"; // 引入 Head 以支持移动端视口设置
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import Card from "../components/Card";
import Fuse from "fuse.js";
import styles from "../styles/Home.module.css";

// 核心视觉：四色柱状图大图标 (Hero 区域专用) [cite: 1, 12]
const HeroLogo = () => (
  <svg width="100" height="100" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* 红色柱 */}
    <rect x="2" y="14" width="6" height="16" rx="1.5" fill="#EF4444" />
    {/* 黄色柱 */}
    <rect x="10" y="8" width="6" height="22" rx="1.5" fill="#F59E0B" />
    {/* 绿色柱 */}
    <rect x="18" y="4" width="6" height="26" rx="1.5" fill="#10B981" />
    {/* 蓝色柱 */}
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

  // 2. 初始化文章搜索索引 
  useEffect(() => {
    if (!articles || articles.length === 0) {
      setArticleFuse(null);
      return;
    }
    const fuse = new Fuse(articles, {
      includeScore: true,
      shouldSort: true,
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
      keys: [
        { name: "title", weight: 0.45 },
        { name: "summary", weight: 0.2 },
        { name: "content", weight: 0.25 },
        { name: "tags", weight: 0.1 },
      ],
    });
    setArticleFuse(fuse);
  }, [articles]);

  // 3. 初始化数据集搜索索引 
  useEffect(() => {
    if (!datasets || datasets.length === 0) {
      setDatasetFuse(null);
      return;
    }
    const fuse = new Fuse(datasets, {
      includeScore: true,
      shouldSort: true,
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
      keys: [
        { name: "name", weight: 0.5 },
        { name: "description", weight: 0.3 },
        { name: "tags", weight: 0.2 },
      ],
    });
    setDatasetFuse(fuse);
  }, [datasets]);

  // 4. 执行搜索过滤 
  const q = query.trim();

  const filteredArticles = useMemo(() => {
    if (!q) return articles;
    if (!articleFuse) return [];
    return articleFuse.search(q).map((r) => r.item);
  }, [q, articleFuse, articles]);

  const filteredDatasets = useMemo(() => {
    if (!q) return datasets;
    if (!datasetFuse) return [];
    return datasetFuse.search(q).map((r) => r.item);
  }, [q, datasetFuse, datasets]);

  const articleCount = filteredArticles.length;
  const datasetCount = filteredDatasets.length;
  const totalCount = articleCount + datasetCount;

  return (
    <Layout title="数据小商店 - 首页">
      <Head>
        {/* 关键：设置视口元标签以支持移动端自适应渲染 */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
      </Head>
      
      <div className={styles.pageWrapper}>
        
        {/* Hero 区域：简约、居中、商务  */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroIcon} style={{ background: 'transparent', boxShadow: 'none', width: 'auto', height: 'auto' }}>
              <HeroLogo />
            </div>
            
            <h1 className={styles.heroTitle}>数据小商店</h1>
            <p className={styles.heroSubtitle}>
              精选行业数据集与深度分析文章，赋能商业决策
            </p>
            
            <div className={styles.heroStats}>
              <div className={styles.statItem}>
                <strong>{articles.length}</strong> 篇深度文章
              </div>
              <div className={styles.statDivider}></div>
              <div className={styles.statItem}>
                <strong>{datasets.length}</strong> 个数据集
              </div>
            </div>
          </div>
        </section>

        {/* 搜索与过滤区域  */}
        <section className={styles.searchSection}>
          <div className={styles.searchWrapper}>
            <SearchBar 
              value={query} 
              onChange={setQuery} 
              className={styles.searchInput} 
              placeholder="搜索文章关键词或数据集名称..."
            />
          </div>
          
          <div className={styles.searchMeta}>
            <div className={styles.tabGroup}>
              {[
                { key: "all", label: "全部资源" },
                { key: "article", label: "文章分析" },
                { key: "dataset", label: "原始数据" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.tabButton} ${activeTab === tab.key ? styles.active : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={styles.searchSummary}>
              {q ? (
                <span>搜索结果：共 <strong>{totalCount}</strong> 条</span>
              ) : (
                <span>浏览精选资源</span>
              )}
            </div>
          </div>
        </section>

        {/* 主要内容区域  */}
        <main className={styles.container}>
          
          {/* 文章列表 */}
          {(activeTab === "all" || activeTab === "article") && (
            <section className={styles.contentSection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>精选文章</h2>
                <span className={styles.sectionSubtitle}>深度解析与专业洞见</span>
              </div>
              
              <div className={styles.cardGrid}>
                {filteredArticles.map((a) => (
                  <div key={a.id} className={styles.cardWrapper}>
                    <Card type="article" item={a} />
                  </div>
                ))}
              </div>
              
              {filteredArticles.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📄</div>
                  <p>未找到相关文章，换个关键词试试？</p>
                </div>
              )}
            </section>
          )}

          {/* 数据集列表 */}
          {(activeTab === "all" || activeTab === "dataset") && (
            <section className={styles.contentSection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>数据集市</h2>
                <span className={styles.sectionSubtitle}>清洗完毕的高质量数据源</span>
              </div>
              
              <div className={styles.cardGrid}>
                {filteredDatasets.map((d) => (
                  <div key={d.id} className={styles.cardWrapper}>
                    <Card type="dataset" item={d} />
                  </div>
                ))}
              </div>
              
              {filteredDatasets.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📊</div>
                  <p>未找到相关数据集，换个关键词试试？</p>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </Layout>
  );
}