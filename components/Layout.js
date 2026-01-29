import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSiteSettings } from "../lib/useSiteSettings";

// 四色 Logo 图标
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
  const siteSettings = useSiteSettings();
  const logoUrl = siteSettings.logoUrl;
  const siteTitle = siteSettings.siteTitle || "DATA STORE";
  const footerText = siteSettings.footerText || "© 2026 数据小商店 DataStore Inc. | 赋能商业决策";

  // 检查登录状态
  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.ok ? res.json() : null)
      .then(data => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    // 使用 window.location.reload() 彻底刷新状态
    window.location.href = "/";
  };

  // --- 样式定义区 (Dark Mode) ---
  const navStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.85)', // 🟢 修复：深色半透明背景 (消除顶部白条)
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #374151',        // 🟢 修复：深色边框
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

  // 导航链接样式
  const navLinkStyle = (path) => ({
    marginLeft: '24px',
    fontSize: '14px',
    fontWeight: '500',
    // 🟢 修复：文字颜色改为灰白/高亮蓝
    color: router.pathname === path ? '#60A5FA' : '#D1D5DB', 
    textDecoration: 'none',
    transition: 'color 0.2s',
    cursor: 'pointer'
  });

  return (
    // 外层容器：确保最小高度且背景全黑
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111827' }}>
      <Head>
        <title>{title || siteTitle || "数据小商店"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航 */}
      <nav style={navStyle}>
        <div style={containerStyle}>
          {/* Logo 区域 */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            ) : (
              <LogoIcon />
            )}
            <span style={{ fontSize: '20px', fontWeight: '800', color: '#F9FAFB', letterSpacing: '-0.5px' }}>
              {siteTitle}
            </span>
          </Link>

          {/* 右侧菜单 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Link href="/" style={navLinkStyle('/')}>首页</Link>

            {siteSettings.aboutContent && (
              <Link
                href="/#about"
                style={{
                  marginLeft: '16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  padding: '6px 10px',
                  borderRadius: '999px',
                  border: '1px solid #374151',
                  color: '#D1D5DB',
                  textDecoration: 'none',
                  background: 'rgba(17, 24, 39, 0.6)'
                }}
              >
                About Us
              </Link>
            )}

            
            {/* 只有管理员显示后台入口 */}
            {user && user.isAdmin && (
              <Link href="/admin" style={navLinkStyle('/admin')}>后台管理</Link>
            )}

            {user && user.isLoggedIn ? (
              <>
                <span style={{ ...navLinkStyle('#'), color: '#10B981' }}>👤 {user.username}</span>
                <a onClick={handleLogout} style={navLinkStyle('#')}>退出</a>
              </>
            ) : (
              <Link href="/login" style={navLinkStyle('/login')}>登录</Link>
            )}
          </div>
        </div>
      </nav>

      {/* 主要内容区 */}
      <main style={{ flex: 1, position: 'relative' }}>
        {children}
      </main>

      {/* 底部 Footer (消除底部白条) */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '32px', 
        color: '#6B7280', // 深灰色文字
        fontSize: '13px', 
        borderTop: '1px solid #1F2937', // 深色分割线
        marginTop: 'auto',
        backgroundColor: '#111827' // 🟢 修复：深色背景
      }}>
        {footerText}
      </footer>
    </div>
  );
}
