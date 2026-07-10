import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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

export default function Layout({ title, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const siteSettings = useSiteSettings();
  // Values come from SSR + provider — no client-only flash of defaults
  const logoUrl = siteSettings.logoUrl || "";
  const siteTitle = siteSettings.siteTitle || "DATA STORE";
  const pageTitle = siteSettings.pageTitle || siteTitle || "数据小商店";
  const footerText =
    siteSettings.footerText || "© 2026 数据小商店 DataStore Inc. | 赋能商业决策";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  const linkClass = (path) =>
    `${styles.navLink}${router.pathname === path ? ` ${styles.navLinkActive}` : ""}`;

  return (
    <div className={styles.shell}>
      <Head>
        <title>{title ? `${title} - ${pageTitle}` : pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label={siteTitle}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className={styles.logoImg}
                width={32}
                height={32}
              />
            ) : (
              <LogoIcon />
            )}
            <span className={styles.brandText}>{siteTitle}</span>
          </Link>

          <div className={styles.navRight}>
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
                <span className={styles.userChip} title={user.username}>
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

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>{footerText}</footer>
    </div>
  );
}
