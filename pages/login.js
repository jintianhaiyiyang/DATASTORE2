import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import styles from "../styles/Auth.module.css";
import { getLoginReturnPath } from "../lib/paymentClient";

export default function AuthPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const sendOtp = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessageOk(false);
      setMessage("请输入正确的邮箱地址");
      return;
    }

    setSendingOtp(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessageOk(res.ok);
      if (res.ok) {
        setMessage("验证码已发送，请检查邮箱（含垃圾邮件箱）");
        setCountdown(60);
      } else {
        setMessage(data.message || "验证码发送失败");
      }
    } catch {
      setMessageOk(false);
      setMessage("网络错误，请稍后重试");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (isRegister && password.length < 8) {
      setMessageOk(false);
      setMessage("密码至少 8 位");
      return;
    }
    setLoading(true);
    setMessage("");
    setMessageOk(false);

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
        // Reload the account-aware layout and return to the resource being bought.
        window.location.assign(getLoginReturnPath(router.query.next));
        return;
      }
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || "操作失败");
    } catch {
      setMessage("网络错误，请稍后重试");
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
          {message && (
            <div className={messageOk ? styles.notice : styles.alert} role={messageOk ? "status" : "alert"}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-account" className={styles.label}>{isRegister ? "邮箱地址" : "邮箱或管理员账号"}</label>
              <input
                id="login-account"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className={styles.input}
                type={isRegister ? "email" : "text"}
                inputMode={isRegister ? "email" : "text"}
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {isRegister && (
              <div className={styles.field}>
              <label htmlFor="login-otp" className={styles.label}>邮箱验证码</label>
                <div className={styles.otpRow}>
                  <input
                    id="login-otp"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className={styles.input}
                    type="text"
                    placeholder="6 位数字"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={countdown > 0 || sendingOtp}
                    className={styles.otpBtn}
                  >
                    {sendingOtp
                      ? "发送中..."
                      : countdown > 0
                        ? `${countdown}s`
                        : "获取验证码"}
                  </button>
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="login-password" className={styles.label}>登录密码</label>
              <input
                id="login-password"
                name="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                maxLength={128}
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
              onClick={() => {
                setIsRegister(!isRegister);
                setMessage("");
                setOtp("");
                setPassword("");
              }}
            >
              {isRegister ? "去登录" : "注册新账号"}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
