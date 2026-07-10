import { useEffect, useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import Layout from "../components/Layout";
import Fuse from "fuse.js";
import styles from "../styles/Home.module.css";
import { useSiteSettings } from "../lib/useSiteSettings";

const HeroLogo = () => (
  <svg width="40" height="40" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="4" y="16" width="4" height="14" rx="1" fill="#F87171" />
    <rect x="10" y="10" width="4" height="20" rx="1" fill="#FBBF24" />
    <rect x="16" y="6" width="4" height="24" rx="1" fill="#34D399" />
    <rect x="22" y="2" width="4" height="28" rx="1" fill="#60A5FA" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [artRes, dsRes] = await Promise.all([
          fetch("/api/articles"),
          fetch("/api/datasets"),
        ]);
        const artData = await artRes.json();
        const dsData = await dsRes.json();
        setArticles(Array.isArray(artData) ? artData : []);
        setDatasets(Array.isArray(dsData) ? dsData : []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (articles.length > 0) {
      setArticleFuse(new Fuse(articles, { keys: ["title", "summary"], threshold: 0.35 }));
    }
    if (datasets.length > 0) {
      setDatasetFuse(new Fuse(datasets, { keys: ["name", "description"], threshold: 0.35 }));
    }
  }, [articles, datasets]);

  const filteredArticles = useMemo(() => {
    if (!query) return articles;
    return articleFuse ? articleFuse.search(query).map((r) => r.item) : [];
  }, [query, articleFuse, articles]);

  const filteredDatasets = useMemo(() => {
    if (!query) return datasets;
    return datasetFuse ? datasetFuse.search(query).map((r) => r.item) : [];
  }, [query, datasetFuse, datasets]);

  const showDatasets = activeTab === "all" || activeTab === "dataset";
  const showArticles = activeTab === "all" || activeTab === "article";
  const totalCount =
    (showDatasets ? filteredDatasets.length : 0) +
    (showArticles ? filteredArticles.length : 0);

  const formatPrice = (price) => {
    const n = Number(price);
    if (!Number.isFinite(n) || n === 0) return { free: true, text: "免费" };
    return { free: false, text: `¥${n % 1 === 0 ? n : n.toFixed(2)}` };
  };

  return (
    <Layout>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.logoWrap}>
              {siteSettings.logoUrl ? (
                <img
                  src={siteSettings.logoUrl}
                  alt="logo"
                  className={styles.logoImg}
                />
              ) : (
                <HeroLogo />
              )}
            </div>
            <h1 className={styles.heroTitle}>
              {siteSettings.siteTitle || "DataStore"}
            </h1>
            <p className={styles.heroDesc}>
              连接高价值数据资产与深度商业洞察
              <br />
              一站式数字资源交易平台
            </p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <strong>{datasets.length}</strong>
                <span>数据集</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <strong>{articles.length}</strong>
                <span>文章</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.searchBar}>
          <div className={styles.searchInner}>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>
                <SearchIcon />
              </span>
              <input
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索数据集、文章..."
                aria-label="搜索"
              />
            </div>
            <div className={styles.tabs}>
              {[
                { key: "all", label: "全部" },
                { key: "dataset", label: "数据集" },
                { key: "article", label: "文章" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <main className={styles.main}>
          {showDatasets && filteredDatasets.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <span className={`${styles.sectionDot} ${styles.sectionDotData}`} />
                  推荐数据集
                </h2>
                <span className={styles.sectionCount}>{filteredDatasets.length} 项</span>
              </div>
              <div className={styles.grid}>
                {filteredDatasets.map((d) => {
                  const price = formatPrice(d.price);
                  return (
                    <Link href={`/dataset/${d.id}`} key={d.id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <span className={`${styles.badge} ${styles.badgeData}`}>数据集</span>
                      </div>
                      <h3 className={styles.cardTitle}>{d.name}</h3>
                      <p className={styles.cardDesc}>{d.description || "暂无描述"}</p>
                      <div className={styles.cardFooter}>
                        <span className={price.free ? styles.priceFree : styles.price}>
                          {price.text}
                        </span>
                        <span className={styles.action}>查看详情</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {showArticles && filteredArticles.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <span className={`${styles.sectionDot} ${styles.sectionDotArticle}`} />
                  精选洞察
                </h2>
                <span className={styles.sectionCount}>{filteredArticles.length} 篇</span>
              </div>
              <div className={styles.grid}>
                {filteredArticles.map((a) => (
                  <Link href={`/article/${a.id}`} key={a.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={`${styles.badge} ${styles.badgeArticle}`}>文章</span>
                      <span className={styles.meta}>
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleDateString("zh-CN")
                          : ""}
                      </span>
                    </div>
                    <h3 className={styles.cardTitle}>{a.title}</h3>
                    <p className={styles.cardDesc}>{a.summary || "暂无摘要"}</p>
                    <div className={styles.cardFooter}>
                      <span className={styles.meta}>阅读</span>
                      <span className={styles.action}>阅读全文</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {totalCount === 0 && (
            <div className={styles.empty}>
              <p>没有找到相关内容，试试其他关键词</p>
            </div>
          )}
        </main>

        {siteSettings.aboutContent && (
          <section id="about" className={styles.aboutSection}>
            <div className={styles.aboutCard}>
              <h2 className={styles.aboutTitle}>关于我们</h2>
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
