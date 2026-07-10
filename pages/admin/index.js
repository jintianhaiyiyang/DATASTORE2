import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { updateSiteSettingsCache } from "../../lib/useSiteSettings";
import styles from "../../styles/Admin.module.css";

export default function AdminPage() {
  const [tab, setTab] = useState("dataset");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState(null);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginMsg, setLoginMsg] = useState("");

  const [articles, setArticles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [siteSettings, setSiteSettings] = useState(null);

  const [editingArticle, setEditingArticle] = useState(null);
  const [editingDataset, setEditingDataset] = useState(null);

  async function fetchAllData() {
    try {
      const [artRes, datRes, siteRes] = await Promise.all([
        fetch("/api/articles"),
        fetch("/api/datasets"),
        fetch("/api/site"),
      ]);
      const artData = await artRes.json();
      const datData = await datRes.json();
      const siteData = await siteRes.json();
      if (Array.isArray(artData)) setArticles(artData);
      if (Array.isArray(datData)) setDatasets(datData);
      if (siteData && typeof siteData === "object") {
        setSiteSettings(siteData);
        updateSiteSettingsCache(siteData);
      }
    } catch (e) {
      console.error("fetch error", e);
    }
  }

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
          setLoginMsg("权限不足：需要管理员账号");
        }
      } catch (e) {
        console.error("auth check error", e);
      } finally {
        setCheckingAuth(false);
      }
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
    } catch {
      setLoginMsg("网络请求异常");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  if (checkingAuth) {
    return (
      <Layout title="验证中...">
        <div className={styles.loading}>正在验证权限...</div>
      </Layout>
    );
  }

  if (!isAuthed) {
    return (
      <Layout title="后台登录">
        <div className={styles.loginWrap}>
          <div className={styles.loginCard}>
            <h1 className={styles.loginTitle}>管理员登录</h1>
            <p className={styles.loginHint}>仅限管理员账号访问后台</p>
            {loginMsg && <div className={styles.alert}>{loginMsg}</div>}
            <form onSubmit={handleLoginSubmit}>
              <div className={styles.field} style={{ marginBottom: 14 }}>
                <label className={styles.label}>账号</label>
                <input
                  className={styles.input}
                  placeholder="管理员账号"
                  value={loginForm.username}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, username: e.target.value })
                  }
                  required
                />
              </div>
              <div className={styles.field} style={{ marginBottom: 18 }}>
                <label className={styles.label}>密码</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="密码"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  required
                />
              </div>
              <button type="submit" className={styles.primaryBtnBlock}>
                进入后台
              </button>
            </form>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="后台管理">
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>内容管理</h1>
            <div className={styles.userInfo}>
              <span>{user?.username}</span>
              <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
                退出
              </button>
            </div>
          </div>

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${tab === "dataset" ? styles.tabActive : ""}`}
              onClick={() => setTab("dataset")}
            >
              数据集
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${tab === "article" ? styles.tabActive : ""}`}
              onClick={() => setTab("article")}
            >
              文章
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${tab === "site" ? styles.tabActive : ""}`}
              onClick={() => setTab("site")}
            >
              站点设置
            </button>
          </div>

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
    </Layout>
  );
}

function SiteSettingsSection({ siteSettings, setSiteSettings }) {
  const [form, setForm] = useState({
    siteTitle: "",
    pageTitle: "",
    logoUrl: "",
    footerText: "",
    aboutContent: "",
  });
  const [logoPreview, setLogoPreview] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!siteSettings) return;
    setForm({
      siteTitle: siteSettings.siteTitle || "",
      pageTitle: siteSettings.pageTitle || "",
      logoUrl: siteSettings.logoUrl || "",
      footerText: siteSettings.footerText || "",
      aboutContent: siteSettings.aboutContent || "",
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
          pageTitle: form.pageTitle,
          logoUrl: form.logoUrl,
          footerText: form.footerText,
          aboutContent: form.aboutContent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSiteSettings(data);
        updateSiteSettingsCache(data);
        setMsg("success");
        setTimeout(() => setMsg(""), 1000);
      } else {
        setMsg(data.message || "保存失败");
      }
    } catch {
      setMsg("网络错误");
    }
  };

  return (
    <form onSubmit={handleSave}>
      <h2 className={styles.sectionTitle}>站点外观</h2>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.label}>站点标题</label>
          <input
            className={styles.input}
            value={form.siteTitle}
            onChange={(e) => setForm({ ...form, siteTitle: e.target.value })}
            placeholder="例如：DATA STORE"
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>标签页标题</label>
          <input
            className={styles.input}
            value={form.pageTitle}
            onChange={(e) => setForm({ ...form, pageTitle: e.target.value })}
            placeholder="例如：DataStore - 数据小商店"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Logo 链接（可选）</label>
          <input
            className={styles.input}
            value={form.logoUrl}
            onChange={(e) => {
              setForm({ ...form, logoUrl: e.target.value });
              setLogoPreview(e.target.value);
            }}
            placeholder="https://..."
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>上传 Logo（建议 200KB 以内）</label>
          <input
            className={styles.input}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>页脚文案</label>
          <input
            className={styles.input}
            value={form.footerText}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            placeholder="例如：© 2026 数据小商店 DataStore Inc."
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>关于我们（HTML）</label>
          <textarea
            className={styles.textarea}
            value={form.aboutContent}
            onChange={(e) => setForm({ ...form, aboutContent: e.target.value })}
            placeholder="介绍你的产品、服务或团队"
          />
        </div>
      </div>

      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn}>
          保存设置
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => {
            setForm({ ...form, logoUrl: "" });
            setLogoPreview("");
          }}
        >
          清除 Logo
        </button>
      </div>

      {logoPreview && (
        <div className={styles.previewBox}>
          <img src={logoPreview} alt="logo preview" className={styles.previewImg} />
        </div>
      )}

      {msg && (
        <p className={msg === "success" ? styles.msgOk : styles.msgErr}>
          {msg === "success" ? "保存成功" : msg}
        </p>
      )}
    </form>
  );
}

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

      <div className={styles.listBlock}>
        <h3 className={styles.listTitle}>已发布数据集（{datasets.length}）</h3>
        {datasets.length === 0 ? (
          <p className={styles.emptyText}>暂无数据</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名称</th>
                  <th>价格</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.name}</td>
                    <td>¥{d.price}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingDataset(d);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        编辑
                      </button>
                      <DeleteBtn url={`/api/datasets/${d.id}`} onDeleted={refresh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function DatasetForm({ editingDataset, onSaved, onCancel }) {
  const isEdit = !!editingDataset;
  const [form, setForm] = useState({
    name: editingDataset?.name || "",
    description: editingDataset?.description || "",
    richContent: editingDataset?.richContent || "",
    price: editingDataset?.price ?? "",
    baiduLink: editingDataset?.baiduLink || editingDataset?.downloadUrl || "",
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
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setMsg("success");
        if (!isEdit) {
          setForm({
            name: "",
            description: "",
            richContent: "",
            price: "",
            baiduLink: "",
            tags: "",
          });
        }
        setTimeout(() => {
          setMsg("");
          onSaved();
        }, 800);
      } else {
        const data = await res.json().catch(() => ({}));
        setMsg(data.message || "发布失败");
      }
    } catch {
      setMsg("网络错误");
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 className={styles.sectionTitle}>
        {isEdit ? `编辑：${editingDataset.name}` : "发布数据集"}
      </h2>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label className={styles.label}>名称</label>
          <input
            className={styles.input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>价格（元）</label>
          <input
            className={styles.input}
            type="number"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>简述</label>
          <input
            className={styles.input}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>图文详情（HTML）</label>
          <textarea
            className={styles.textarea}
            value={form.richContent}
            onChange={(e) => setForm({ ...form, richContent: e.target.value })}
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>网盘 / 下载链接</label>
          <input
            className={styles.input}
            value={form.baiduLink}
            onChange={(e) => setForm({ ...form, baiduLink: e.target.value })}
            required
          />
        </div>
      </div>
      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn}>
          {isEdit ? "保存修改" : "立即发布"}
        </button>
        {isEdit && (
          <button type="button" onClick={onCancel} className={styles.secondaryBtn}>
            取消
          </button>
        )}
      </div>
      {msg && (
        <p className={msg === "success" ? styles.msgOk : styles.msgErr}>
          {msg === "success" ? "操作成功" : msg}
        </p>
      )}
    </form>
  );
}

function ArticleAdminSection({ articles, editingArticle, setEditingArticle, refresh }) {
  return (
    <>
      <ArticleForm
        key={editingArticle ? editingArticle.id : "new"}
        editingArticle={editingArticle}
        onSaved={async () => {
          await refresh();
          setEditingArticle(null);
        }}
        onCancel={() => setEditingArticle(null)}
      />
      <div className={styles.listBlock}>
        <h3 className={styles.listTitle}>已发布文章（{articles.length}）</h3>
        {articles.length === 0 ? (
          <p className={styles.emptyText}>暂无文章</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>标题</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td>{a.title}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingArticle(a);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        编辑
                      </button>
                      <DeleteBtn url={`/api/articles/${a.id}`} onDeleted={refresh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ArticleForm({ editingArticle, onSaved, onCancel }) {
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
    setMsg("提交中...");
    try {
      const url = isEdit ? `/api/articles/${editingArticle.id}` : "/api/articles";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setMsg("success");
        if (!isEdit) setForm({ title: "", summary: "", content: "", tags: "" });
        setTimeout(() => {
          setMsg("");
          onSaved();
        }, 800);
      } else {
        const data = await res.json().catch(() => ({}));
        setMsg(data.message || "失败");
      }
    } catch {
      setMsg("失败");
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 className={styles.sectionTitle}>{isEdit ? "编辑文章" : "发布文章"}</h2>
      <div className={styles.formGrid}>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>标题</label>
          <input
            className={styles.input}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>摘要</label>
          <input
            className={styles.input}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>内容（HTML）</label>
          <textarea
            className={styles.textarea}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            required
          />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label className={styles.label}>标签（逗号分隔）</label>
          <input
            className={styles.input}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="例如：教程, 数据"
          />
        </div>
      </div>
      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn}>
          {isEdit ? "保存修改" : "发布文章"}
        </button>
        {isEdit && (
          <button type="button" onClick={onCancel} className={styles.secondaryBtn}>
            取消
          </button>
        )}
      </div>
      {msg && (
        <p className={msg === "success" ? styles.msgOk : styles.msgErr}>
          {msg === "success" ? "操作成功" : msg}
        </p>
      )}
    </form>
  );
}

function DeleteBtn({ url, onDeleted }) {
  const handleDelete = async () => {
    if (!confirm("确定要删除吗？此操作不可恢复。")) return;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) onDeleted();
      else alert("删除失败");
    } catch {
      alert("网络错误");
    }
  };
  return (
    <button type="button" className={styles.deleteBtn} onClick={handleDelete}>
      删除
    </button>
  );
}
