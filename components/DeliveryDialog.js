import { useEffect, useRef, useState } from "react";
import LinkedText from "./LinkedText";
import styles from "../styles/Delivery.module.css";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "";
}

/**
 * Shows what the buyer received for a digital product.
 * entries: [{ key, label?, text?, pending?, time? }]
 */
export default function DeliveryDialog({ name, title = "购买成功", entries, onClose }) {
  const dialog = useRef(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (node.showModal) node.showModal();
    else node.setAttribute("open", "");
    node.querySelector("[data-autofocus]")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll("button:not(:disabled), a[href]")];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(""), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyable = entries.filter((entry) => entry.text);
  const copy = async (key, text) => setCopied(await copyText(text) ? key : "error");

  return (
    <div className={styles.overlay} onClick={onClose}>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="delivery-title" onCancel={onClose}
        onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">×</button>
        <div className={styles.badge} aria-hidden="true">✓</div>
        <h2 id="delivery-title" className={styles.title}>{title}</h2>
        <p className={styles.name}>{name}</p>

        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.key} className={styles.entry}>
              {(entry.label || entry.time) && (
                <div className={styles.entryHead}>
                  <span>{entry.label}</span>
                  {entry.time && <time>{formatTime(entry.time)}</time>}
                </div>
              )}
              {entry.pending ? (
                <p className={styles.pending}>已付款，商品暂时缺货。补货后会自动发放到这里，无需再次付款。</p>
              ) : (
                <>
                  <pre className={styles.content}><LinkedText text={entry.text || ""} /></pre>
                  <button type="button" className={styles.copyBtn} onClick={() => copy(entry.key, entry.text)}>
                    {copied === entry.key ? "已复制 ✓" : "复制"}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {copyable.length > 1 && (
          <button type="button" className={styles.copyAll}
            onClick={() => copy("all", copyable.map((entry) => entry.text).join("\n"))}>
            {copied === "all" ? "已全部复制 ✓" : `复制全部（${copyable.length} 条）`}
          </button>
        )}
        <p className={styles.tip} role="status">
          {copied === "error" ? "复制失败，请长按或选中文本手动复制" : "请妥善保存。之后可在“我的订单”或商品页随时再次查看。"}
        </p>
        <button type="button" className={styles.done} onClick={onClose} data-autofocus>我已保存</button>
      </dialog>
    </div>
  );
}
