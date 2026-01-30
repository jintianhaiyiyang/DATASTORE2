import Link from "next/link";
import styles from "../styles/Card.module.css";

export default function Card({ type, item }) {
  // item.isPaid 是由后端返回的，判断当前用户是否对该 ID 付过费
  const isPaid = item.isPaid || false;
  const href = type === "article" ? `/article/${item.id}` : `/dataset/${item.id}`;
  
  const tags = Array.isArray(item.tags) 
    ? item.tags 
    : (item.tags || "").split(",").filter(t => t.trim());

  const renderPriceOrDownload = () => {
    if (type !== "dataset") return null;
    
    // 如果已付款，显示已购状态
    if (isPaid) {
      return <span className={styles.paidBadge}>已购买</span>;
    }

    if (!item.price || Number(item.price) === 0) {
      return <span className={styles.free}>免费</span>;
    }
    return <span className={styles.price}>¥{Number(item.price).toFixed(2)}</span>;
  };

  return (
    <article className={styles.card}>
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className={styles.header}>
          <span className={`${styles.typeBadge} ${type === 'article' ? styles.typeArticle : styles.typeDataset}`}>
            {type === 'article' ? '深度文章' : '数据集'}
          </span>
          {renderPriceOrDownload()}
        </div>

        <h3 className={styles.title}>{item.title || item.name}</h3>
        <p className={styles.summary}>{item.summary || item.description || "暂无描述..."}</p>
      </Link>

      <div className={styles.footer}>
        <div className={styles.tagList}>
          {tags.slice(0, 2).map((tag, i) => (
            <span key={i} className={styles.tag}>#{tag}</span>
          ))}
        </div>
        
        {/* 如果已付费，显示下载操作按钮 */}
        {isPaid && item.downloadUrl && (
          <a 
            href={item.downloadUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={styles.downloadBtn}
            onClick={(e) => e.stopPropagation()}
          >
            立即下载
          </a>
        )}
      </div>
    </article>
  );
}