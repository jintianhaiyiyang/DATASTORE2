import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="16" width="5" height="12" rx="1" fill="#EF4444" />
    <rect x="11" y="10" width="5" height="18" rx="1" fill="#F59E0B" />
    <rect x="18" y="6" width="5" height="22" rx="1" fill="#10B981" />
    <rect x="25" y="2" width="5" height="26" rx="1" fill="#2563EB" />
  </svg>
);

export default function Layout({ title, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  // 挂载时检查登录状态
  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.ok ? res.json() : null)
      .then(data => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
  };

  const navStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid #E5E7EB',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    height: '64px',
    display: 'flex',
    alignItems: 'center'
  };

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const navLinkStyle = (path) => ({
    marginLeft: '24px',
    fontSize: '14px',
    fontWeight: '500',
    color: router.pathname === path ? '#2563EB' : '#4B5563',
    textDecoration: 'none',
    transition: 'color 0.2s',
    cursor: 'pointer'
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Head>
        <title>{title || "数据小商店"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <nav style={navStyle}>
        <div style={containerStyle}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: '800', color: '#111827', textDecoration: 'none' }}>
            <LogoIcon />
            <span>DATA STORE</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Link href="/" style={navLinkStyle('/')}>首页</Link>
            {user ? (
              <>
                <span style={navLinkStyle('#')}>👤 {user.username}</span>
                <a onClick={handleLogout} style={navLinkStyle('#')}>退出</a>
              </>
            ) : (
              <Link href="/login" style={navLinkStyle('/login')}>登录</Link>
            )}
          </div>
        </div>
      </nav>

      <main style={{ flex: 1 }}>{children}</main>

      <footer style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF', fontSize: '13px', borderTop: '1px solid #E5E7EB', marginTop: 'auto' }}>
        © 2025 数据小商店 DataStore Inc.
      </footer>
    </div>
  );
}