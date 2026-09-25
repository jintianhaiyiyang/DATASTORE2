import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import styles from "../../styles/Detail.module.css";

function ArticleContent({ id }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    fetch(`/api/articles/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((res) => {
        if (res.status === 404) throw Object.assign(new Error("这篇文章不存在或已被删除"), { notFound: true });
        if (!res.ok) throw new Error("文章加载失败，请稍后重试");
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setArticle(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setError({ message: err.message || "网络异常，请稍后重试", notFound: !!err.notFound });
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  if (loading) {
    return (
      <Layout title="加载中">
        <div className={styles.loadingBox} role="status">正在加载文章…</div>
      </Layout>
    );
  }

  if (error || !article) {
    return (
      <Layout title={error?.notFound ? "文章不存在" : "加载失败"}>
        <div className={styles.emptyBox}>
          <h1 className={styles.emptyTitle}>{error?.notFound ? "文章不存在" : "加载失败"}</h1>
          <p role="alert">{error?.message || "抱歉，找不到这篇文章"}</p>
          <div className={styles.emptyActions}>
            {!error?.notFound && (
              <button type="button" className={styles.checkBtn} onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>
                重新加载
              </button>
            )}
            <Link href="/" className={styles.backLink}>← 返回首页</Link>
          </div>
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
              {article.createdAt && (
                <time dateTime={article.createdAt}>
                  {new Date(article.createdAt).toLocaleDateString("zh-CN")}
                </time>
              )}
              {Array.isArray(article.tags) &&
                article.tags.map((tag) => (
                  <span key={tag} className={styles.articleTag}>
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
