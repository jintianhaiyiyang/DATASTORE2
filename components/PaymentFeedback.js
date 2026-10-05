import { useEffect, useRef, useState } from 'react';
import styles from '../styles/PaymentFeedback.module.css';

export function PaymentCountdown({ deadline, seconds, onCancel }) {
  const ref = useRef(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const node = ref.current, previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (node.showModal) node.showModal(); else node.setAttribute('open', '');
    node.querySelector('button')?.focus();
    const trap = (e) => { if (e.key === 'Tab') { e.preventDefault(); node.querySelector('button')?.focus(); } };
    node.addEventListener('keydown', trap);
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => { clearInterval(timer); node.removeEventListener('keydown', trap); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="usdt-preparing-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
    <span className={styles.eyebrow}>USDT · BEP-20</span>
    <div className={styles.ring} style={{ '--progress': `${seconds ? Math.min(1, Math.max(0, (deadline - now) / (seconds * 1000))) * 100 : 0}%` }}>
      <div>{left > 0 ? <><strong>{left}</strong><span>秒</span></> : <span className={styles.spinner} aria-label="正在准备"/>}</div>
    </div>
    <h2 id="usdt-preparing-title">{left > 0 ? '正在准备你的收银台' : '正在完成订单准备'}</h2>
    <p>准备完成后自动打开付款订单。<br/>请稍候，无需重复点击。</p>
    <button type="button" onClick={onCancel}>取消等待</button>
  </dialog>;
}

export function CopyToast({ message }) {
  useEffect(() => {
    const timer = setTimeout(message.dismiss, 1800);
    return () => clearTimeout(timer);
  }, [message]);
  return <div className={styles.toast} role="status" aria-live="polite">
    <span className={styles.check}>✓</span><div><strong>复制成功</strong><span>{message.label}已复制到剪贴板</span></div>
  </div>;
}
