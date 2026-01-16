import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import styles from "../../styles/Admin.module.css"; 

export default function AdminPage() {
  const [tab, setTab] = useState("article");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState(null);

  // 登录表单
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginMsg, setLoginMsg] = useState("");

  const [articles, setArticles] = useState([]);
  const [editingArticle, setEditingArticle] = useState(null);

  // 1. 获取文章列表
  async function fetchArticles() {
    try {
      const res = await fetch("/api/articles");
      const data = await res.json();
      if (Array.isArray(data)) setArticles(data);
    } catch (e) { console.error("fetch error", e); }
  }

  // 2. 权限校验 (核心修改：只认 isAdmin 金牌)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        
        // 🟢 只有 data.isAdmin === true 才能进
        if (data.isLoggedIn && data.isAdmin) {
          setIsAuthed(true);
          setUser(data);
          await fetchArticles();
        } else if (data.isLoggedIn && !data.isAdmin) {
          // 如果是普通用户登录了，提示权限不足
          setLoginMsg("⚠️ 您的账号是普通用户，无权访问后台");
        }
      } catch (e) {
        console.error("auth check error", e);
      } finally {
        setCheckingAuth(false);
      }
    };
    run();
  }, []);

  // 3. 登录提交
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginMsg("验证中...");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        // 登录成功后刷新页面，让 useEffect 重新检查 isAdmin 权限
        window.location.reload(); 
      } else {
        setLoginMsg(data.message || "账号或密码错误");
      }
    } catch (err) {
      setLoginMsg("网络请求异常");
    }
  };

  // 4. 退出登录
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  if (checkingAuth) {
    return (
      <Layout title="验证中...">
        <div style={{padding:'50px', textAlign:'center', color:'#fff'}}>
          ⌛️ 正在验证权限...
        </div>
      </Layout>
    );
  }

  // --- 未授权 / 登录界面 ---
  if (!isAuthed) {
    return (
      <Layout title="后台登录">
        <div className={styles.container}>
          <div className={styles.loginContainer} style={{maxWidth: '400px', margin: '80px auto', padding: '40px', background: '#fff', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)'}}>
            <h1 style={{ marginBottom: '24px', textAlign: 'center', color: '#111', fontSize: '24px' }}>🔒 管理员入口</h1>
            <p style={{ marginBottom: '24px', color: '#666', fontSize: '14px', textAlign: 'center' }}>
              只有管理员账号可进入
            </p>
            
            {/* 权限不足提示 */}
            {loginMsg && loginMsg.includes("普通用户") && (
              <div style={{background: '#FEE2E2', color: '#B91C1C', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', textAlign: 'center'}}>
                ⛔️ 权限不足：请注销普通账号，使用管理员账号登录
              </div>
            )}

            <form className={styles.form} onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <input
                  style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' }}
                  placeholder="管理员账号 (默认: admin)"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                  required
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <input
                  style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' }}
                  type="password"
                  placeholder="管理员密码 (默认: admin123)"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" style={{ width: '100%', padding: '14px', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                验证身份
              </button>
              
              {loginMsg && !loginMsg.includes("普通用户") && (
                <p style={{ marginTop: '16px', color: 'red', textAlign: 'center' }}>{loginMsg}</p>
              )}
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  // --- 已授权：后台管理界面 ---
  return (
    <Layout title="后台发布中心">
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1>🛠️ 超级管理后台</h1>
            <div className={styles.userInfo}>
              <span style={{marginRight: '15px', color: 'green', fontWeight: 'bold'}}>✓ 已认证: {user?.username}</span>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>退出</button>
            </div>
          </div>

          <div className={styles.tip}>
            💡 提示：在此处发布的内容将实时同步到云数据库。
          </div>

          <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${tab === "article" ? styles.active : ""}`} onClick={() => setTab("article")}>文章管理</button>
            <button className={`${styles.tabBtn} ${tab === "dataset" ? styles.active : ""}`} onClick={() => setTab("dataset")}>数据集发布</button>
          </div>

          {tab === "article" ? (
            <ArticleAdminSection
              articles={articles}
              editingArticle={editingArticle}
              setEditingArticle={setEditingArticle}
              refreshArticles={fetchArticles}
            />
          ) : (
            <DatasetForm />
          )}
        </div>
      </div>
    </Layout>
  );
}

// ==========================================
// 👇 下面是完整的子组件，请勿删除
// ==========================================

// --- 文章管理子组件 ---
function ArticleAdminSection({ articles, editingArticle, setEditingArticle, refreshArticles }) {
  return (
    <>
      <ArticleForm
        key={editingArticle ? editingArticle.id : "new"}
        editingArticle={editingArticle}
        onSaved={async () => {
          await refreshArticles();
          setEditingArticle(null);
        }}
        onCancelEdit={() => setEditingArticle(null)}
      />
      
      <div className={styles.tableWrapper}>
        <div style={{padding: '16px', borderBottom: '1px solid #E5E7EB'}}>
           <h3 className={styles.tableHeaderTitle}>已发布文章列表 ({articles.length})</h3>
        </div>
        
        {articles.length === 0 ? (
           <div style={{padding: '30px', textAlign: 'center', color: '#999'}}>暂无文章。</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{width: '60px'}}>ID</th>
                <th>标题</th>
                <th>摘要</th>
                <th>标签</th>
                <th style={{width: '180px'}}>发布时间</th>
                <th style={{width: '80px'}}>操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td style={{fontWeight: 500}}>{a.title}</td>
                  <td style={{maxWidth: '200px', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {a.summary || '无摘要'}
                  </td>
                  <td>
                    {a.tags && a.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                  </td>
                  <td style={{fontSize: '13px', color: '#666'}}>
                    {a.createdAt ? new Date(a.createdAt).toLocaleString("zh-CN") : "-"}
                  </td>
                  <td>
                    <button className={styles.actionBtn} onClick={() => {
                        setEditingArticle(a);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// --- 文章表单 ---
function ArticleForm({ editingArticle, onSaved, onCancelEdit }) {
  const isEdit = !!editingArticle;
  const [form, setForm] = useState({
    title: editingArticle?.title || "",
    summary: editingArticle?.summary || "",
    content: editingArticle?.content || "",
    tags: editingArticle?.tags ? editingArticle.tags.join(",") : "",
  });
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const url = isEdit ? `/api/articles/${editingArticle.id}` : "/api/articles";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags.split(",").map(t => t.trim()).filter(Boolean)
        }),
      });
      if (res.ok) {
        setMsg("success");
        if (!isEdit) setForm({ title: "", summary: "", content: "", tags: "" });
        setTimeout(() => { setMsg(""); if (onSaved) onSaved(); }, 800);
      } else { setMsg("error: 发布失败"); }
    } catch (err) { setMsg("error: 网络错误"); }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 style={{fontSize: '18px', marginBottom: '10px'}}>{isEdit ? "✏️ 编辑文章" : "📝 发布新文章"}</h2>
      <div className={styles.formGrid}>
        <div className={styles.fullWidth}>
          <label>文章标题</label>
          <input className={styles.input} value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} required />
        </div>
        <div className={styles.fullWidth}>
          <label>文章摘要</label>
          <input className={styles.input} value={form.summary} onChange={(e) => setForm({...form, summary: e.target.value})} />
        </div>
        <div className={styles.fullWidth}>
          <label>正文内容 (支持 HTML)</label>
          <textarea className={styles.textarea} rows={8} value={form.content} onChange={(e) => setForm({...form, content: e.target.value})} required />
        </div>
        <div className={styles.fullWidth}>
          <label>标签 (逗号分隔)</label>
          <input className={styles.input} value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} />
        </div>
      </div>
      <div className={styles.btnGroup}>
        <button type="submit" className={styles.primaryBtn}>{isEdit ? "保存更改" : "立即发布"}</button>
        {isEdit && <button type="button" className={styles.secondaryBtn} onClick={onCancelEdit}>取消</button>}
      </div>
      {msg && <div className={`${styles.message} ${msg.startsWith('error') ? styles.errorMsg : ''}`}>{msg === "success" ? "🎉 成功" : msg}</div>}
    </form>
  );
}

// --- 数据集表单 (含 richContent, baiduLink) ---
function DatasetForm() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    richContent: "", // 用于图文详情
    price: "",
    currency: "CNY",
    tags: "",
    baiduLink: "",
  });
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      const res = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price || 0),
          tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setMsg("success");
        setForm({ name: "", description: "", richContent: "", price: "", currency: "CNY", tags: "", baiduLink: "" });
      } else { setMsg("error: 发布失败"); }
    } catch (err) { setMsg("error: 网络错误"); }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <h2 style={{fontSize: '18px', marginBottom: '10px'}}>📦 发布新数据集</h2>
      <div className={styles.formGrid}>
        <div>
          <label>数据集名称</label>
          <input className={styles.input} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
        </div>
        <div>
           <label>价格 (元)</label>
           <input className={styles.input} type="number" step="0.01" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} required />
        </div>
        <div className={styles.fullWidth}>
          <label>列表简述 (摘要)</label>
          <input className={styles.input} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} required />
        </div>
        <div className={styles.fullWidth}>
          <label>详情页图文内容 (支持 HTML)</label>
          <textarea className={styles.textarea} rows={10} value={form.richContent} onChange={(e) => setForm({...form, richContent: e.target.value})} placeholder="输入图文介绍 HTML..." />
        </div>
        <div>
          <label>网盘/下载链接 (支付后可见)</label>
          <input className={styles.input} value={form.baiduLink} onChange={(e) => setForm({...form, baiduLink: e.target.value})} required placeholder="例如: https://pan.baidu.com/..." />
        </div>
        <div>
          <label>标签 (逗号分隔)</label>
          <input className={styles.input} value={form.tags} onChange={(e) => setForm({...form, tags: e.target.value})} />
        </div>
      </div>
      <div className={styles.btnGroup}>
        <button type="submit" className={styles.primaryBtn}>发布数据集</button>
      </div>
      {msg && <div className={`${styles.message} ${msg.startsWith('error') ? styles.errorMsg : ''}`}>{msg === "success" ? "🎉 发布成功" : msg}</div>}
    </form>
  );
}
