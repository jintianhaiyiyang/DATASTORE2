import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import Head from "next/head";

// 内置深色样式 (Black Gold Theme)
const styles = {
  mainWrapper: {
    backgroundColor: '#111827', // 深色背景
    minHeight: '100vh',
    color: '#E5E7EB',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '40px 20px',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: '30px',
    color: '#9CA3AF',
    textDecoration: 'none',
    fontSize: '14px',
    transition: 'color 0.2s',
    cursor: 'pointer'
  },
  articleCard: {
    background: '#1F2937', // 卡片背景
    borderRadius: '24px',
    padding: '40px',
    border: '1px solid #374151',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    color: 'white',
    marginBottom: '20px',
    lineHeight: '1.4'
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'center',
    color: '#6B7280',
    fontSize: '14px',
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #374151'
  },
  tag: {
    background: '#2563EB',
    color: 'white',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  richContent: {
    lineHeight: '1.8',
    fontSize: '17px',
    color: '#D1D5DB',
    wordWrap: 'break-word'
  },
  loadingContainer: {
    minHeight: '60vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#9CA3AF'
  }
};

export default function ArticleDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    
    // 获取文章详情
    fetch(`/api/articles/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error("文章不存在或已被删除");
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then((data) => {
        setArticle(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // 加载中状态
  if (loading) {
    return (
      <Layout title="加载中...">
        <div style={styles.mainWrapper}>
          <div style={styles.loadingContainer}>
            <p>⌛️ 正在加载精彩内容...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // 错误状态 (404)
  if (error || !article) {
    return (
      <Layout title="未找到">
        <div style={styles.mainWrapper}>
          <div style={{...styles.loadingContainer, flexDirection: 'column'}}>
            <h1 style={{fontSize: '48px', marginBottom: '20px'}}>404</h1>
            <p style={{marginBottom: '20px'}}>{error || "抱歉，找不到这篇文章"}</p>
            <Link href="/" style={{...styles.backLink, color: '#3B82F6'}}>返回首页</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={article.title}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      
      <div style={styles.mainWrapper}>
        <div style={styles.container}>
          {/* 返回按钮 */}
          <Link href="/" style={styles.backLink}>← 返回首页</Link>
          
          <article style={styles.articleCard}>
            {/* 标题 */}
            <h1 style={styles.title}>{article.title}</h1>
            
            {/* 元信息：日期、作者、标签 */}
            <div style={styles.meta}>
              <span>📅 {article.createdAt ? new Date(article.createdAt).toLocaleDateString() : '未知日期'}</span>
              
              {article.author && <span>✍️ {article.author}</span>}
              
              {article.tags && article.tags.length > 0 && (
                <div style={{display: 'flex', gap: '8px'}}>
                  {article.tags.map((tag, idx) => (
                    <span key={idx} style={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* 正文内容 (渲染 HTML) */}
            <div 
              style={styles.richContent}
              dangerouslySetInnerHTML={{ __html: article.content }} 
            />
          </article>
        </div>
      </div>

      {/* 补充全局样式，防止富文本里的图片溢出 */}
      <style jsx global>{`
        article img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 20px 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        article p {
          margin-bottom: 1.5em;
        }
        article h2 {
          color: white;
          margin-top: 1.5em;
          margin-bottom: 0.8em;
          font-size: 1.5em;
        }
        article ul, article ol {
          margin-left: 20px;
          margin-bottom: 1.5em;
        }
        article li {
          margin-bottom: 0.5em;
        }
        article a {
          color: #3B82F6;
          text-decoration: none;
        }
        article a:hover {
          text-decoration: underline;
        }
        article blockquote {
          border-left: 4px solid #3B82F6;
          padding-left: 16px;
          margin-left: 0;
          color: #9CA3AF;
          font-style: italic;
        }
      `}</style>
    </Layout>
  );
}
