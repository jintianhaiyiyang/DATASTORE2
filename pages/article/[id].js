import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import styles from "../../styles/Detail.module.css";

function ArticleContent({ id }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    fetch(`/api/articles/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((res) => {
        if (res.status === 404) throw new Error("文章不存在或已被删除");
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setArticle(data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <Layout title="加载中...">
        <div className={styles.loadingBox}>
          <p>正在加载内容...</p>
        </div>
      </Layout>
    );
  }

  if (error || !article) {
    return (
      <Layout title="未找到">
        <div className={styles.emptyBox}>
          <h1 style={{ fontSize: "2rem", marginBottom: 12, color: "var(--text-primary)" }}>
            404
          </h1>
          <p style={{ marginBottom: 16 }}>{error || "抱歉，找不到这篇文章"}</p>
          <Link href="/" className={styles.backLink}>
            ← 返回首页
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={article.title}>
      <div className={styles.mainWrapper}>
        <div className={styles.articleShell}>
          <Link href="/" className={styles.backLink}>
            ← 返回首页
          </Link>

          <article className={styles.articleCard}>
            <h1 className={styles.articleTitle}>{article.title}</h1>

            <div className={styles.articleMeta}>
              <span>
                {article.createdAt
                  ? new Date(article.createdAt).toLocaleDateString("zh-CN")
                  : "未知日期"}
              </span>
              {article.author && <span>{article.author}</span>}
              {article.tags &&
                article.tags.length > 0 &&
                article.tags.map((tag, idx) => (
                  <span key={idx} className={styles.articleTag}>
                    {tag}
                  </span>
                ))}
            </div>

            <div
              className={styles.articleBody}
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          </article>
        </div>
      </div>
    </Layout>
  );
}

export default function ArticleDetail() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  return <ArticleContent key={id} id={id} />;
}
