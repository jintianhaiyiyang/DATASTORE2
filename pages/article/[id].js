import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import Link from "next/link";
import styles from "../../styles/Detail.module.css";

export default function ArticleDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/articles/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setArticle(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className={styles.pageWrapper}>
          <div className={styles.container} style={{textAlign:'center', color:'#999', paddingTop:'80px'}}>
            加载中...
          </div>
        </div>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout>
        <div className={styles.pageWrapper}>
          <div className={styles.container} style={{textAlign:'center', paddingTop:'80px'}}>
            <h2>文章不存在</h2>
            <Link href="/" className={styles.backLink}>← 返回首页</Link>
          </div>
        </div>
      </Layout>
    );
  }

  const tags = article.tags || [];

  return (
    <Layout title={article.title}>
      <div className={styles.pageWrapper}>
        <div className={styles.container}>
          
          <Link href="/" className={styles.backLink}>← 返回首页</Link>

          <article className={styles.card}>
            {/* 头部信息 */}
            <header className={styles.header}>
              <h1 className={styles.title}>{article.title}</h1>
              
              <div className={styles.meta}>
                <span>📅 {article.createdAt ? new Date(article.createdAt).toLocaleDateString() : '未知日期'}</span>
                
                {tags.map(t => (
                  <span key={t} className={styles.tag}>#{t}</span>
                ))}
              </div>
            </header>

            {/* 正文内容 */}
            {/* 提示：如果你的内容是纯文本，white-space: pre-wrap 会保留换行 */}
            {/* 如果你后续接入了 Markdown，这里可以用 <ReactMarkdown> */}
            <div className={styles.content}>
              {article.content}
            </div>
            
          </article>
        </div>
      </div>
    </Layout>
  );
}