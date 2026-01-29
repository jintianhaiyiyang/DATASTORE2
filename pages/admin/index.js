import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
// 我们直接在组件内写样式，覆盖掉 styles/Admin.module.css 的亮色样式
const darkStyles = {
  container: { padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#E5E7EB' },
  card: { background: '#1F2937', borderRadius: '16px', padding: '30px', border: '1px solid #374151', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #374151', paddingBottom: '20px' },
  title: { fontSize: '24px', fontWeight: 'bold', color: 'white' },
  userInfo: { color: '#10B981', fontWeight: 'bold', fontSize: '14px' },
  logoutBtn: { marginLeft: '15px', background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
  tabs: { display: 'flex', gap: '10px', marginBottom: '30px' },
  tabBtn: (active) => ({
    padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '600', transition: 'all 0.2s',
    background: active ? '#2563EB' : '#374151', color: active ? 'white' : '#9CA3AF'
  }),
  input: { width: '100%', padding: '12px', background: '#374151', border: '1px solid #4B5563', borderRadius: '8px', color: 'white', fontSize: '14px', marginTop: '6px' },
  textarea: { width: '100%', padding: '12px', background: '#374151', border: '1px solid #4B5563', borderRadius: '8px', color: 'white', fontSize: '14px', marginTop: '6px', minHeight: '100px' },
  label: { fontSize: '14px', color: '#9CA3AF', marginBottom: '4px', display: 'block' },
  primaryBtn: { width: '100%', padding: '14px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '20px' },
  secondaryBtn: { padding: '14px', background: '#4B5563', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '20px', marginLeft: '10px' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
  th: { textAlign: 'left', padding: '12px', borderBottom: '1px solid #4B5563', color: '#9CA3AF', fontSize: '14px' },
  td: { padding: '12px', borderBottom: '1px solid #374151', color: '#E5E7EB', fontSize: '14px' },
  actionBtn: { padding: '4px 10px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer', marginRight: '8px' },
  editBtn: { background: '#3B82F6', color: 'white' },
  deleteBtn: { background: '#EF4444', color: 'white' }
};

export default function AdminPage() {
  const [tab, setTab] = useState("dataset"); // 默认看数据集
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState(null);
  
  // 登录表单
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginMsg, setLoginMsg] = useState("");

  const [articles, setArticles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [siteSettings, setSiteSettings] = useState(null);
  
  // 编辑状态
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingDataset, setEditingDataset] = useState(null);

  // 获取数据
  async function fetchAllData() {
    try {
      const [artRes, datRes, siteRes] = await Promise.all([
        fetch("/api/articles"),
        fetch("/api/datasets"),
        fetch("/api/site")
      ]);
      const artData = await artRes.json();
      const datData = await datRes.json();
      const siteData = await siteRes.json();
      if (Array.isArray(artData)) setArticles(artData);
      if (Array.isArray(datData)) setDatasets(datData);
      if (siteData && typeof siteData === "object") setSiteSettings(siteData);
    } catch (e) { console.error("fetch error", e); }
  }

  // 权限校验
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.isLoggedIn && data.isAdmin) {
          setIsAuthed(true);
          setUser(data);
          await fetchAllData();
        } else if (data.isLoggedIn && !data.isAdmin) {
          setLoginMsg("⚠️ 权限不足：需要管理员账号");
        }
      } catch (e) { console.error("auth check error", e); } finally { setCheckingAuth(false); }
    };
    run();
  }, []);

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
      if (res.ok && data.success) window.location.reload(); 
      else setLoginMsg(data.message || "账号或密码错误");
    } catch (err) { setLoginMsg("网络请求异常"); }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  if (checkingAuth) return <Layout title="验证中..."><div style={{padding:'50px', textAlign:'center', color:'#fff'}}>⌛️ 正在验证权限...</div></Layout>;

  // --- 登录界面 (Dark Mode) ---
  if (!isAuthed) {
    return (
      <Layout title="后台登录">
        <div style={{minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827'}}>
          <div style={{width: '100%', maxWidth: '400px', background: '#1F2937', padding: '40px', borderRadius: '16px', border: '1px solid #374151'}}>
            <h1 style={{marginBottom: '20px', textAlign: 'center', color: 'white', fontSize: '24px'}}>🔒 管理员入口</h1>
            {loginMsg && <div style={{background: '#7F1D1D', color: '#FECACA', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', textAlign: 'center'}}>{loginMsg}</div>}
            <form onSubmit={handleLoginSubmit}>
              <div style={{marginBottom: '16px'}}>
                <input style={darkStyles.input} placeholder="管理员账号 (默认: admin)" value={loginForm.username} onChange={(e) => setLoginForm({...loginForm, username: e.target.value})} required />
              </div>
              <div style={{marginBottom: '24px'}}>
                <input style={darkStyles.input} type="password" placeholder="密码 (默认: admin123)" value={loginForm.password} onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} required />
              </div>
              <button type="submit" style={darkStyles.primaryBtn}>进入后台</button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  // --- 管理界面 (Dark Mode) ---
  return (
    <Layout title="后台发布中心">
      <div style={{background: '#111827', minHeight: '100vh', padding: '20px'}}>
        <div style={darkStyles.container}>
          <div style={darkStyles.card}>
            {/* 头部 */}
            <div style={darkStyles.header}>
              <h1 style={darkStyles.title}>🛠️ 超级管理后台</h1>
              <div style={darkStyles.userInfo}>
                <span>✓ 已认证: {user?.username}</span>
                <button onClick={handleLogout} style={darkStyles.logoutBtn}>退出</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={darkStyles.tabs}>
              <button style={darkStyles.tabBtn(tab === "dataset")} onClick={() => setTab("dataset")}>数据集管理</button>
              <button style={darkStyles.tabBtn(tab === "article")} onClick={() => setTab("article")}>文章管理</button>
              <button style={darkStyles.tabBtn(tab === "site")} onClick={() => setTab("site")}>站点设置</button>
            </div>

            {/* 内容区 */}
            {tab === "dataset" ? (
              <DatasetAdminSection 
                datasets={datasets} 
                editingDataset={editingDataset}
                setEditingDataset={setEditingDataset}
                refresh={fetchAllData}
              />
            ) : tab === "article" ? (
              <ArticleAdminSection
                articles={articles}
                editingArticle={editingArticle}
                setEditingArticle={setEditingArticle}
                refresh={fetchAllData}
              />
            ) : (
              <SiteSettingsSection
                siteSettings={siteSettings}
                setSiteSettings={setSiteSettings}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// =======================
// 站点设置
// =======================
function SiteSettingsSection({ siteSettings, setSiteSettings }) {
  const [form, setForm] = useState({ siteTitle: "", logoUrl: "", footerText: "" });
  const [logoPreview, setLogoPreview] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!siteSettings) return;
    setForm({
      siteTitle: siteSettings.siteTitle || "",
      logoUrl: siteSettings.logoUrl || "",
      footerText: siteSettings.footerText || "",
    });
    setLogoPreview(siteSettings.logoUrl || "");
  }, [siteSettings]);

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("仅支持图片格式");
      return;
    }
    if (file.size > 200 * 1024) {
      setMsg("图片过大，建议小于 200KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setForm((prev) => ({ ...prev, logoUrl: dataUrl }));
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg("保存中...");
    try {
      const res = await fetch("/api/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteTitle: form.siteTitle,
          logoUrl: form.logoUrl,
          footerText: form.footerText,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSiteSettings(data);
        setMsg("success");
        setTimeout(() => setMsg(""), 1000);
      } else {
        setMsg(data.message || "保存失败");
      }
    } catch (err) {
      setMsg("网络错误");
    }
  };

  return (
    <form onSubmit={handleSave}>
      <h2 style={{fontSize: '18px', color: 'white', marginBottom: '16px'}}>站点外观设置</h2>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
        <div>
          <label style={darkStyles.label}>标题</label>
          <input
            style={darkStyles.input}
            value={form.siteTitle}
            onChange={(e) => setForm({ ...form, siteTitle: e.target.value })}
            placeholder="例如：DATA STORE"
            required
          />
        </div>
        <div>
          <label style={darkStyles.label}>Logo 图片链接 (可选)</label>
          <input
            style={darkStyles.input}
            value={form.logoUrl}
            onChange={(e) => {
              setForm({ ...form, logoUrl: e.target.value });
              setLogoPreview(e.target.value);
            }}
            placeholder="https://..."
          />
        </div>
        <div style={{gridColumn: 'span 2'}}>
          <label style={darkStyles.label}>上传 Logo (建议 200KB 以内)</label>
          <input style={darkStyles.input} type="file" accept="image/*" onChange={handleFileChange} />
        </div>
        <div style={{gridColumn: 'span 2'}}>
          <label style={darkStyles.label}>底部小字</label>
          <input
            style={darkStyles.input}
            value={form.footerText}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            placeholder="例如：© 2026 数据小商店 DataStore Inc. | 赋能商业决策"
          />
        </div>
      </div>

      <div style={{marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px'}}>
        <button type="submit" style={darkStyles.primaryBtn}>保存设置</button>
        <button
          type="button"
          onClick={() => {
            setForm({ ...form, logoUrl: "" });
            setLogoPreview("");
          }}
          style={darkStyles.secondaryBtn}
        >
          清除 Logo
        </button>
      </div>

      {logoPreview && (
        <div style={{marginTop: '20px'}}>
          <label style={darkStyles.label}>预览</label>
          <div style={{background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #374151'}}>
            <img src={logoPreview} alt="logo preview" style={{width: '96px', height: '96px', objectFit: 'contain'}} />
          </div>
        </div>
      )}

      {msg && <p style={{color: msg==='success'?'#10B981':'#EF4444', marginTop: '10px'}}>{msg === 'success' ? '操作成功' : msg}</p>}
    </form>
  );
}

// =======================
// 🟢 新增：数据集管理组件
// =======================
function DatasetAdminSection({ datasets, editingDataset, setEditingDataset, refresh }) {
  return (
    <>
      <DatasetForm
        key={editingDataset ? editingDataset.id : "new"}
        editingDataset={editingDataset}
        onSaved={async () => {
          await refresh();
          setEditingDataset(null);
        }}
        onCancel={() => setEditingDataset(null)}
      />
      
      <div style={{marginTop: '40px', borderTop: '1px solid #374151', paddingTop: '20px'}}>
        <h3 style={{color: 'white', marginBottom: '16px'}}>📚 已发布数据集 ({datasets.length})</h3>
        {datasets.length === 0 ? <p style={{color: '#6B7280'}}>暂无数据</p> : (
          <table style={darkStyles.table}>
            <thead>
              <tr>
                <th style={darkStyles.th}>ID</th>
                <th style={darkStyles.th}>名称</th>
                <th style={darkStyles.th}>价格</th>
                <th style={darkStyles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map(d => (
                <tr key={d.id}>
                  <td style={darkStyles.td}>{d.id}</td>
                  <td style={darkStyles.td}>{d.name}</td>
                  <td style={darkStyles.td}>¥{d.price}</td>
                  <td style={darkStyles.td}>
                    <button style={{...darkStyles.actionBtn, ...darkStyles.editBtn}} onClick={() => { setEditingDataset(d); window.scrollTo({top:0, behavior:'smooth'}); }}>编辑</button>
                    <DeleteBtn url={`/api/datasets/${d.id}`} onDeleted={refresh} />
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

// 🟢 升级：数据集表单 (支持编辑)
function DatasetForm({ editingDataset, onSaved, onCancel }) {
  const isEdit = !!editingDataset;
  const [form, setForm] = useState({
    name: editingDataset?.name || "",
    description: editingDataset?.description || "",
    richContent: editingDataset?.richContent || "",
    price: editingDataset?.price || "",
    baiduLink: editingDataset?.baiduLink || "",
    tags: editingDataset?.tags ? editingDataset.tags.join(",") : "",
  });
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("提交中...");
    try {
      const url = isEdit ? `/api/datasets/${editingDataset.id}` : "/api/datasets";
      const method = isEdit ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price || 0),
          tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setMsg("success");
        if (!isEdit) setForm({ name: "", description: "", richContent: "", price: "", baiduLink: "", tags: "" });
        setTimeout(() => { setMsg(""); onSaved(); }, 800);
      } else { setMsg("发布失败"); }
    } catch (err) { setMsg("网络错误"); }
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{fontSize: '18px', color: 'white', marginBottom: '16px'}}>{isEdit ? `✏️ 编辑数据集: ${editingDataset.name}` : "📦 发布新数据集"}</h2>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
        <div><label style={darkStyles.label}>名称</label><input style={darkStyles.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div><label style={darkStyles.label}>价格 (元)</label><input style={darkStyles.input} type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})} required /></div>
        <div style={{gridColumn: 'span 2'}}><label style={darkStyles.label}>简述</label><input style={darkStyles.input} value={form.description} onChange={e => setForm({...form, description: e.target.value})} required /></div>
        <div style={{gridColumn: 'span 2'}}><label style={darkStyles.label}>图文详情 (HTML)</label><textarea style={darkStyles.textarea} value={form.richContent} onChange={e => setForm({...form, richContent: e.target.value})} /></div>
        <div style={{gridColumn: 'span 2'}}><label style={darkStyles.label}>网盘/下载链接</label><input style={darkStyles.input} value={form.baiduLink} onChange={e => setForm({...form, baiduLink: e.target.value})} required /></div>
      </div>
      <div style={{display: 'flex', marginTop: '20px'}}>
        <button type="submit" style={darkStyles.primaryBtn}>{isEdit ? "保存修改" : "立即发布"}</button>
        {isEdit && <button type="button" onClick={onCancel} style={darkStyles.secondaryBtn}>取消编辑</button>}
      </div>
      {msg && <p style={{color: msg==='success'?'#10B981':'#EF4444', marginTop: '10px'}}>{msg === 'success' ? '🎉 操作成功' : msg}</p>}
    </form>
  );
}

// =======================
// 文章管理组件 (保持原有逻辑，已适配 Dark Mode)
// =======================
function ArticleAdminSection({ articles, editingArticle, setEditingArticle, refresh }) {
  return (
    <>
      <ArticleForm
        key={editingArticle ? editingArticle.id : "new"}
        editingArticle={editingArticle}
        onSaved={async () => { await refresh(); setEditingArticle(null); }}
        onCancel={() => setEditingArticle(null)}
      />
      <div style={{marginTop: '40px', borderTop: '1px solid #374151', paddingTop: '20px'}}>
        <h3 style={{color: 'white', marginBottom: '16px'}}>📄 已发布文章 ({articles.length})</h3>
        <table style={darkStyles.table}>
          <thead>
            <tr><th style={darkStyles.th}>ID</th><th style={darkStyles.th}>标题</th><th style={darkStyles.th}>操作</th></tr>
          </thead>
          <tbody>
            {articles.map(a => (
              <tr key={a.id}>
                <td style={darkStyles.td}>{a.id}</td>
                <td style={darkStyles.td}>{a.title}</td>
                <td style={darkStyles.td}>
                  <button style={{...darkStyles.actionBtn, ...darkStyles.editBtn}} onClick={() => { setEditingArticle(a); window.scrollTo({top:0, behavior:'smooth'}); }}>编辑</button>
                  <DeleteBtn url={`/api/articles/${a.id}`} onDeleted={refresh} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ArticleForm({ editingArticle, onSaved, onCancel }) {
  const isEdit = !!editingArticle;
  const [form, setForm] = useState({ title: editingArticle?.title || "", summary: editingArticle?.summary || "", content: editingArticle?.content || "", tags: editingArticle?.tags ? editingArticle.tags.join(",") : "" });
  const [msg, setMsg] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("提交中...");
    try {
      const url = isEdit ? `/api/articles/${editingArticle.id}` : "/api/articles";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({...form, tags: form.tags.split(",").filter(Boolean)}) });
      if (res.ok) { setMsg("success"); if (!isEdit) setForm({title:"",summary:"",content:"",tags:""}); setTimeout(() => {setMsg(""); onSaved();}, 800); } else { setMsg("error"); }
    } catch { setMsg("error"); }
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 style={{fontSize: '18px', color: 'white', marginBottom: '16px'}}>{isEdit ? "✏️ 编辑文章" : "📝 发布新文章"}</h2>
      <div style={{display: 'grid', gap: '20px'}}>
        <div><label style={darkStyles.label}>标题</label><input style={darkStyles.input} value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
        <div><label style={darkStyles.label}>摘要</label><input style={darkStyles.input} value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} /></div>
        <div><label style={darkStyles.label}>内容 (HTML)</label><textarea style={darkStyles.textarea} value={form.content} onChange={e => setForm({...form, content: e.target.value})} required /></div>
      </div>
      <div style={{display: 'flex', marginTop: '20px'}}>
        <button type="submit" style={darkStyles.primaryBtn}>{isEdit ? "保存修改" : "发布文章"}</button>
        {isEdit && <button type="button" onClick={onCancel} style={darkStyles.secondaryBtn}>取消</button>}
      </div>
      {msg && <p style={{color: msg==='success'?'#10B981':'#EF4444', marginTop: '10px'}}>{msg === 'success' ? '🎉 操作成功' : '❌ 失败'}</p>}
    </form>
  );
}

// 通用删除按钮
function DeleteBtn({ url, onDeleted }) {
  const handleDelete = async () => {
    if (!confirm("确定要删除吗？此操作不可恢复。")) return;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) onDeleted();
      else alert("删除失败");
    } catch { alert("网络错误"); }
  };
  return <button style={{...darkStyles.actionBtn, ...darkStyles.deleteBtn}} onClick={handleDelete}>删除</button>;
}
