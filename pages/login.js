import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import styles from "../styles/Home.module.css";

export default function AuthPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0); // 倒计时状态
  const router = useRouter();

  // 倒计时逻辑
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // 发送验证码
  const sendOtp = async () => {
    if (!email.includes("@")) return alert("请输入正确邮箱");
    
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      alert("验证码已发送！");
      setCountdown(60); // 开启 60s 冷却
    } else {
      const data = await res.json();
      alert(data.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // 根据模式选择接口
    const url = isRegister ? "/api/auth/register" : "/api/auth/login";
    const body = isRegister ? { email, otp, password } : { username: email, password };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push("/");
      // 登录/注册成功后强制刷新页面以同步 Layout 状态
      setTimeout(() => router.reload(), 500); 
    } else {
      const data = await res.json();
      alert(data.message);
    }
    setLoading(false);
  };

  return (
    <Layout title={isRegister ? "注册" : "登录"}>
      <div className={styles.container} style={{ maxWidth: "420px", marginTop: "80px" }}>
        <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", boxShadow: "var(--shadow-lg)", border: "1px solid #E5E7EB" }}>
          <h1 style={{ textAlign: "center", marginBottom: "32px", fontSize: "24px", fontWeight: "800" }}>
            {isRegister ? "新用户注册" : "欢迎回来"}
          </h1>
          
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>邮箱地址</label>
              <input 
                type="email" placeholder="example@gmail.com" required
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "15px" }}
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>

            {isRegister && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>邮箱验证码</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input 
                    type="text" placeholder="6位数字" required
                    style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #D1D5DB" }}
                    value={otp} onChange={e => setOtp(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={sendOtp} 
                    disabled={countdown > 0}
                    style={{ 
                      padding: "0 16px", borderRadius: "8px", border: "none",
                      background: countdown > 0 ? "#9CA3AF" : "#2563EB", 
                      color: "#fff", cursor: countdown > 0 ? "not-allowed" : "pointer",
                      fontSize: "14px", transition: "0.2s"
                    }}
                  >
                    {countdown > 0 ? `${countdown}s` : "获取"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>登录密码</label>
              <input 
                type="password" placeholder="••••••••" required
                style={{ padding: "12px", borderRadius: "8px", border: "1px solid #D1D5DB" }}
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              style={{ 
                marginTop: "10px", padding: "14px", borderRadius: "8px", border: "none",
                background: "#111827", color: "#fff", fontWeight: "700", 
                fontSize: "16px", cursor: "pointer", transition: "0.2s"
              }}
            >
              {loading ? "正在处理..." : (isRegister ? "立即创建账号" : "登录系统")}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #F3F4F6" }}>
            <p style={{ color: "#6B7280", fontSize: "14px" }}>
              {isRegister ? "已经有账号了？" : "还没有账号？"}
              <span 
                style={{ color: "#2563EB", fontWeight: "600", cursor: "pointer", marginLeft: "6px" }} 
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "去登录" : "注册新账号"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}