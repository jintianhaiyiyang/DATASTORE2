import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import styles from "../../styles/Admin.module.css"; 

export default function AdminPage() {
  const [tab, setTab] = useState("article");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState(null);

  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [loginMsg, setLoginMsg] = useState("");

  const [articles, setArticles] = useState([]);
  const [editingArticle, setEditingArticle] = useState(null);

  // 1. 获取文章列表
  async function fetchArticles() {
    try {
      const res = await fetch("/api/articles");
      const data = await res.json();
      if (Array.isArray(data)) {
        setArticles(data);
      }
    } catch (e) {
      console.error("fetch articles error", e);
    }
  }

  // 2. 初始化校验管理员权限
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        // 必须是已认证且用户名为 admin 才能进入
        if (data.isAuthenticated && data.username === 'admin') {
          setIsAuthed(true);
          setUser({ username: data.username });
          await fetchArticles();
        }
      } catch (e) {
        console.error("check auth error", e);
      }
      setCheckingAuth(false);
    };
    run();
  }, []);

  // 3. 登录逻辑
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthed(true);
        setUser({ username: data.username });
        setLoginMsg("登录成功");
        await fetchArticles();
      } else {
        setLoginMsg(data.message || "登录失败");
      }
    } catch (err) {
      setLoginMsg("登录异常");
    }
  };

  // 4. 退出逻辑
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) { /* ignore */ }
    setIsAuthed(false);
    setUser(null);
    setArticles([]);
    setEditingArticle(null);
  };

  if (checkingAuth) {
    return (
      <Layout title="验证中...">
        <div className={styles.container}>
          <div className={styles.card} style={{textAlign: 'center', color: '#666'}}>
            <p>🔒 正在验证身份权限...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // --- 登录界面 ---
  if (!isAuthed) {
    return (
      <Layout title="后台登录">
        <div className={styles.container}>
          <div className={styles.loginContainer}>
            <h1 style={{ marginBottom: '24px' }}>后台管理系统</h1>
            <p style={{ marginBottom: '24px', color: '#666', fontSize: '14px' }}>
              请使用管理员账号登录以继续
            </p>
            <form className={styles.form} onSubmit={handleLoginSubmit}>
              <div>
                <input
                  className={styles.input}
                  placeholder="用户名"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                  required
                />
              </div>
              <div>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="密码"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className={styles.primaryBtn} style={{width: '100%'}}>
                立即登录
              </button>
              {loginMsg && (
                <p className={`${styles.message} ${!loginMsg.includes('成功') ? styles.errorMsg : ''}`}>
                  {loginMsg}
                </p>
              )}
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  // --- 主管理界面 ---
  return (
    <Layout title="后台发布中心">
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1>后台控制台</h1>
            <div className={styles.userInfo}>
              <span>👤 {user?.username}</span>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>退出</button>
            </div>
          </div>

          <div className={styles.tip}>
            💡 提示：本后台用于发布“图文并茂”的数据集及文章内容。
          </div>

          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === "article" ? styles.active : ""}`}
              onClick={() => setTab("article")}
            >
              文章管理
            </button>
            <button
              className={`${styles.tabBtn} ${tab === "dataset" ? styles.active : ""}`}
              onClick={() => setTab("dataset")}
            >
              数据集管理
            </button>
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

// --- 数据集表单 (新增 richContent 字段) ---
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
          <label>百度网盘链接</label>
          <input className={styles.input} value={form.baiduLink} onChange={(e) => setForm({...form, baiduLink: e.target.value})} required />
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