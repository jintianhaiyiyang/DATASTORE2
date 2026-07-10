import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import styles from "../styles/Auth.module.css";

export default function AuthPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const sendOtp = async () => {
    if (!email.includes("@")) return alert("请输入正确邮箱");

    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      alert("验证码已发送！");
      setCountdown(60);
    } else {
      const data = await res.json();
      alert(data.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRegister && password.length < 8) {
      alert("密码至少 8 位");
      return;
    }
    setLoading(true);

    const url = isRegister ? "/api/auth/register" : "/api/auth/login";
    const body = isRegister
      ? { email, otp, password }
      : { username: email, password };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      alert(data.message || "操作失败");
    } catch {
      alert("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title={isRegister ? "注册" : "登录"}>
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>
            {isRegister ? "创建账号" : "欢迎回来"}
          </h1>
          <p className={styles.subtitle}>
            {isRegister
              ? "使用邮箱验证码完成注册"
              : "登录后即可购买与管理资源"}
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>邮箱地址</label>
              <input
                className={styles.input}
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {isRegister && (
              <div className={styles.field}>
                <label className={styles.label}>邮箱验证码</label>
                <div className={styles.otpRow}>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="6 位数字"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={countdown > 0}
                    className={styles.otpBtn}
                  >
                    {countdown > 0 ? `${countdown}s` : "获取验证码"}
                  </button>
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>登录密码</label>
              <input
                className={styles.input}
                type="password"
                placeholder={isRegister ? "至少 8 位密码" : "请输入密码"}
                required
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className={styles.submit}>
              {loading
                ? "处理中..."
                : isRegister
                  ? "创建账号"
                  : "登录"}
            </button>
          </form>

          <div className={styles.switch}>
            {isRegister ? "已有账号？" : "还没有账号？"}
            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? "去登录" : "注册新账号"}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
