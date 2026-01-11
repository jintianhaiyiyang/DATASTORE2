import Link from "next/link";

export default function Navbar() {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/">
          <span className="navbar-logo">📊 数据小商店</span>
        </Link>
        <nav className="navbar-links">
          <Link href="/">首页</Link>
          <Link href="/admin">后台发布</Link>
        </nav>
      </div>
    </header>
  );
}
