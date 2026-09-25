import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSiteSettings } from "../lib/useSiteSettings";
import styles from "../styles/Layout.module.css";

const LogoIcon = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="4" y="16" width="5" height="12" rx="1.5" fill="#F87171" />
    <rect x="11" y="10" width="5" height="18" rx="1.5" fill="#FBBF24" />
    <rect x="18" y="6" width="5" height="22" rx="1.5" fill="#34D399" />
    <rect x="25" y="2" width="5" height="26" rx="1.5" fill="#60A5FA" />
  </svg>
);

const DISMISS_KEY = "datastore_announcement_dismissed";
const DISMISS_EVENT = "announcement-dismissed";

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return "";
  }
}

function subscribeDismissed(callback) {
  window.addEventListener(DISMISS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DISMISS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

const MegaphoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

function AnnouncementBar({ text, link, tone }) {
  // Closing hides this exact announcement; a new text shows again.
  const signature = `${text}\n${link}`;
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => "");
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, signature);
    } catch {
      // Without storage the bar simply returns on the next page.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }, [signature]);

  if (dismissed === signature) return null;
  const external = /^https:\/\//i.test(link);
  return (
    <aside className={`${styles.announcement} ${tone === "warning" ? styles.announcementWarning : ""}`} aria-label="网站公告">
      <div className={styles.announcementInner}>
        <span className={styles.announcementIcon}><MegaphoneIcon /></span>
        <p className={styles.announcementText}>
          {text}
          {link && (external ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={styles.announcementLink}>查看详情</a>
          ) : (
            <Link href={link} className={styles.announcementLink}>查看详情</Link>
          ))}
        </p>
        <button type="button" className={styles.announcementClose} onClick={dismiss} aria-label="关闭公告">×</button>
      </div>
    </aside>
  );
}

export default function Layout({ title, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const siteSettings = useSiteSettings();
  // Values come from SSR + provider — no client-only flash of defaults
  const logoUrl = siteSettings.logoUrl || "";
  const siteTitle = siteSettings.siteTitle || "DATA STORE";
  const pageTitle = siteSettings.pageTitle || siteTitle || "数据小商店";
  const footerText =
    siteSettings.footerText || "数据小商店 DataStore | 赋能商业决策";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.assign(new URL("/", window.location.origin).toString());
    } catch {
      setLogoutError("退出失败，请检查网络后重试");
    }
  };

  const linkClass = (path) =>
    `${styles.navLink}${router.pathname === path ? ` ${styles.navLinkActive}` : ""}`;

  return (
    <div className={styles.shell}>
      <Head>
        <title>{title ? `${title} - ${pageTitle}` : pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>

      <a href="#main-content" className={styles.skipLink}>跳到正文</a>
      <nav className={styles.nav} aria-label="主导航">
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label={siteTitle}>
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                className={styles.logoImg}
                width={32}
                height={32}
                unoptimized
              />
            ) : (
              <LogoIcon />
            )}
            <span className={styles.brandText}>{siteTitle}</span>
          </Link>

          <button type="button" className={styles.menuToggle} aria-expanded={menuOpen} aria-controls="primary-navigation"
            onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "收起" : "菜单"}</button>
          <div id="primary-navigation" className={`${styles.navRight} ${menuOpen ? styles.navOpen : ""}`}
            onClick={(event) => { if (event.target.closest("a")) setMenuOpen(false); }}
            onKeyDown={(event) => { if (event.key === "Escape") { setMenuOpen(false); event.currentTarget.previousElementSibling?.focus(); } }}>
            <Link href="/" className={linkClass("/")}>
              首页
            </Link>

            {siteSettings.aboutContent && (
              <Link href="/#about" className={styles.aboutPill}>
                关于我们
              </Link>
            )}

            {user && user.isAdmin && (
              <Link href="/admin" className={linkClass("/admin")}>
                后台
              </Link>
            )}

            {user && user.isLoggedIn ? (
              <>
                <span className={styles.userChip} title={user.username || user.email}>
                  {user.username}
                </span>
                <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
                  退出
                </button>
              </>
            ) : (
              <Link href="/login" className={styles.loginBtn}>
                登录
              </Link>
            )}
          </div>
        </div>
      </nav>

      {siteSettings.announcementEnabled && siteSettings.announcementText && (
        <AnnouncementBar
          text={siteSettings.announcementText}
          link={siteSettings.announcementLink || ""}
          tone={siteSettings.announcementTone}
        />
      )}
      {logoutError && <p role="alert" className={styles.navError}>{logoutError}</p>}
      <main id="main-content" className={styles.main}>{children}</main>

      <footer className={styles.footer}>{footerText}</footer>
    </div>
  );
}
