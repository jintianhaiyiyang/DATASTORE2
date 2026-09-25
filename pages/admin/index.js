import { useCallback, useEffect, useId, useRef, useState } from "react";
import Layout from "../../components/Layout";
import Image from "next/image";
import { useRouter } from "next/router";
import { updateSiteSettingsCache } from "../../lib/useSiteSettings";
import { ANNOUNCEMENT_MAX_LENGTH } from "../../lib/siteDefaults";
import styles from "../../styles/Admin.module.css";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState("dataset");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [user, setUser] = useState(null);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginMsg, setLoginMsg] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [articles, setArticles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [editingArticle, setEditingArticle] = useState(null);
  const [editingDataset, setEditingDataset] = useState(null);

  async function fetchAllData() {
    try {
      const [artRes, datRes, siteRes] = await Promise.all([
        fetch("/api/articles"),
        fetch("/api/datasets"),
        fetch("/api/site"),
      ]);
      const [artData, datData, siteData] = await Promise.all(
        [artRes, datRes, siteRes].map((res) => (res.ok ? res.json() : null))
      );
      if (Array.isArray(artData)) setArticles(artData);
      if (Array.isArray(datData)) setDatasets(datData);
      // An error body such as { message } must not replace the saved settings.
      if (siteData && typeof siteData === "object" && typeof siteData.siteTitle === "string") {
        setSiteSettings(siteData);
        updateSiteSettingsCache(siteData);
      }
      setLoadError(artRes.ok && datRes.ok && siteRes.ok ? "" : "部分内容加载失败，请刷新页面重试");
    } catch (e) {
      console.error("fetch error", e);
      setLoadError("网络异常，内容加载失败，请刷新页面重试");
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
    if (loggingIn) return;
    setLoggingIn(true);
    setLoginMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.isAdmin) {
        router.reload();
        return;
      }
      setLoginMsg(res.ok ? "权限不足：需要管理员账号" : data.message || "账号或密码错误");
    } catch {
      setLoginMsg("网络请求异常");
    }
    setLoggingIn(false);
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
            {loginMsg && <div className={styles.alert} role="alert">{loginMsg}</div>}
            <form onSubmit={handleLoginSubmit} className={styles.loginForm}>
              <div className={styles.field}>
                <label htmlFor="admin-username" className={styles.label}>账号</label>
                <input
                  id="admin-username"
                  className={styles.input}
                  placeholder="管理员账号"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={loginForm.username}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, username: e.target.value })
                  }
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="admin-password" className={styles.label}>密码</label>
                <input
                  id="admin-password"
                  className={styles.input}
                  type="password"
                  autoComplete="current-password"
                  placeholder="密码"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  required
                />
              </div>
              <button type="submit" className={styles.primaryBtnBlock} disabled={loggingIn}>
                {loggingIn ? "验证中…" : "进入后台"}
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
            <div>
              <h1 className={styles.title}>内容管理</h1>
              <p className={styles.subtitle}>
                当前账号：{user?.username} · 共 {datasets.length} 个数据集、{articles.length} 篇文章
              </p>
            </div>
          </div>
          {loadError && <p className={styles.msgErr} role="alert">{loadError}</p>}

          <div className={styles.tabs}>
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                className={`${styles.tabBtn} ${tab === key ? styles.tabActive : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
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
          ) : !siteSettings ? (
            <p className={styles.loading}>正在加载站点设置...</p>
          ) : tab === "announcement" ? (
            <AnnouncementSection siteSettings={siteSettings} setSiteSettings={setSiteSettings} />
          ) : tab === "payment" ? (
            <PaymentSection siteSettings={siteSettings} setSiteSettings={setSiteSettings} />
          ) : (
            <SiteSettingsSection siteSettings={siteSettings} setSiteSettings={setSiteSettings} />
          )}
        </div>
      </div>
    </Layout>
  );
}

const TABS = [
  { key: "dataset", label: "数据集" },
  { key: "article", label: "文章" },
  { key: "announcement", label: "公告" },
  { key: "payment", label: "支付" },
  { key: "site", label: "站点设置" },
];

const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function formatPrice(price) {
  const n = Number(price);
  return !Number.isFinite(n) || n === 0 ? "免费" : `¥${n.toFixed(2)}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("zh-CN") : "";
}

function splitTags(value) {
  return value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
}

function Field({ label, hint, full = false, children }) {
  const id = useId();
  return (
    <div className={`${styles.field} ${full ? styles.full : ""}`}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      {children(id)}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

// Success notices live above the forms, which remount after each save.
function useNotice() {
  const [notice, setNotice] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((text) => {
    clearTimeout(timer.current);
    setNotice(text);
    timer.current = setTimeout(() => setNotice(""), 3000);
  }, []);
  return [notice, flash];
}

function Notice({ text }) {
  return (
    <p className={styles.msgOk} role="status" hidden={!text}>
      {text}
    </p>
  );
}

function FormError({ msg }) {
  return msg ? <p className={styles.msgErr} role="alert">{msg}</p> : null;
}

// Each settings tab sends only its own fields; the API merges them.
function useSettingsSave(setSiteSettings, successText) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [notice, flash] = useNotice();
  const save = async (payload) => {
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSiteSettings(data);
        updateSiteSettingsCache(data);
        flash(successText);
      } else {
        setMsg(data.message || "保存失败");
      }
    } catch {
      setMsg("网络错误，请重试");
    } finally {
      setSaving(false);
    }
  };
  return { saving, msg, setMsg, notice, save };
}

function Toggle({ label, description, checked, onChange }) {
  const id = useId();
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <label htmlFor={id} className={styles.toggleLabel}>{label}</label>
        {description && <p className={styles.hint}>{description}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

function AnnouncementSection({ siteSettings, setSiteSettings }) {
  const [form, setForm] = useState(() => ({
    announcementEnabled: !!siteSettings.announcementEnabled,
    announcementText: siteSettings.announcementText || "",
    announcementLink: siteSettings.announcementLink || "",
    announcementTone: siteSettings.announcementTone === "warning" ? "warning" : "info",
  }));
  const { saving, msg, notice, save } = useSettingsSave(setSiteSettings, "公告已保存");
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const warning = form.announcementTone === "warning";

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(form); }}>
      <h2 className={styles.sectionTitle}>公告栏</h2>
      <p className={styles.sectionHint}>
        公告显示在每个页面的导航栏下方。访客可以关闭公告；修改公告内容后会重新显示给所有人。
      </p>
      <Toggle
        label="在网站顶部显示公告"
        checked={form.announcementEnabled}
        onChange={(checked) => setForm((prev) => ({ ...prev, announcementEnabled: checked }))}
      />
      <div className={styles.formGrid}>
        <Field label="公告内容" hint={`${form.announcementText.length} / ${ANNOUNCEMENT_MAX_LENGTH} 字，纯文本`} full>
          {(id) => (
            <textarea id={id} className={`${styles.textarea} ${styles.textareaPlain}`} value={form.announcementText}
              onChange={set("announcementText")} maxLength={ANNOUNCEMENT_MAX_LENGTH}
              placeholder="例如：国庆期间所有数据集 8 折，10 月 7 日截止。" required={form.announcementEnabled} />
          )}
        </Field>
        <Field label="链接（可选）" hint="站内路径如 /dataset/…，或 https:// 开头的外部链接">
          {(id) => <input id={id} className={styles.input} value={form.announcementLink}
            onChange={set("announcementLink")} placeholder="/dataset/…" maxLength={500} />}
        </Field>
        <Field label="样式">
          {(id) => (
            <select id={id} className={styles.input} value={form.announcementTone} onChange={set("announcementTone")}>
              <option value="info">普通（蓝色）</option>
              <option value="warning">重要（橙色）</option>
            </select>
          )}
        </Field>
      </div>

      <p className={styles.previewLabel}>预览</p>
      <div className={`${styles.announcePreview} ${warning ? styles.announcePreviewWarning : ""}`}>
        {form.announcementText || "公告内容会显示在这里"}
        {form.announcementLink && <span className={styles.announcePreviewLink}>查看详情</span>}
      </div>

      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? "保存中…" : "保存公告"}
        </button>
      </div>
      <FormError msg={msg} />
      <Notice text={notice} />
    </form>
  );
}

const PAYMENT_PROVIDERS = [
  {
    key: "enableWechatPay",
    id: "wechat",
    name: "微信支付",
    description: "电脑显示二维码；手机浏览器跳转微信；微信内直接调起收银台。",
    env: "WX_APP_ID、WX_MCH_ID、WX_API_V3_KEY、WX_CERT、WX_KEY（微信内支付另需 WX_APP_SECRET）",
  },
  {
    key: "enableAlipay",
    id: "alipay",
    name: "支付宝",
    description: "电脑跳转支付宝收银台；手机浏览器跳转支付宝网页或 App。微信内无法使用支付宝。",
    env: "ALIPAY_APP_ID、ALIPAY_PRIVATE_KEY、ALIPAY_PUBLIC_KEY",
  },
];

function PaymentSection({ siteSettings, setSiteSettings }) {
  const [form, setForm] = useState(() => ({
    enableWechatPay: siteSettings.enableWechatPay !== false,
    enableAlipay: siteSettings.enableAlipay !== false,
  }));
  const configured = siteSettings.paymentConfigured || {};
  const { saving, msg, notice, save } = useSettingsSave(setSiteSettings, "支付设置已保存");
  const noneAvailable = PAYMENT_PROVIDERS.every((p) => !(form[p.key] && configured[p.id]));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(form); }}>
      <h2 className={styles.sectionTitle}>支付方式</h2>
      <p className={styles.sectionHint}>
        关闭后，购买页不再显示该支付方式，服务端也会拒绝用它创建新订单；已经发起的订单仍会正常确认并解锁。
      </p>
      <div className={styles.providerList}>
        {PAYMENT_PROVIDERS.map((p) => (
          <div key={p.id} className={styles.providerCard}>
            <Toggle
              label={`在购买页显示${p.name}`}
              description={p.description}
              checked={form[p.key]}
              onChange={(checked) => setForm((prev) => ({ ...prev, [p.key]: checked }))}
            />
            <p className={configured[p.id] ? styles.statusOk : styles.statusWarn}>
              {configured[p.id] ? "环境变量已配置" : `未配置环境变量：${p.env}`}
            </p>
            {form[p.key] && !configured[p.id] && (
              <p className={styles.hint}>已开启但尚未配置，前台暂不显示此支付方式。</p>
            )}
          </div>
        ))}
      </div>
      <p className={styles.hint}>“已配置”只表示环境变量已填写；支付产品是否开通、签约，以商户平台审核结果为准。</p>
      {noneAvailable && (
        <p className={styles.msgWarn} role="status">当前没有可用的支付方式，用户将无法购买付费资源。</p>
      )}
      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? "保存中…" : "保存支付设置"}
        </button>
      </div>
      <FormError msg={msg} />
      <Notice text={notice} />
    </form>
  );
}

function SiteSettingsSection({ siteSettings, setSiteSettings }) {
  const [form, setForm] = useState(() => ({
    siteTitle: siteSettings?.siteTitle || "",
    pageTitle: siteSettings?.pageTitle || "",
    logoUrl: siteSettings?.logoUrl || "",
    footerText: siteSettings?.footerText || "",
    aboutContent: siteSettings?.aboutContent || "",
  }));
  const { saving, msg, setMsg, notice, save } = useSettingsSave(setSiteSettings, "站点设置已保存");
  // Only preview values the server would accept; next/image throws on others.
  const logoPreview = /^(https:\/\/|data:image\/)/i.test(form.logoUrl) ? form.logoUrl : "";

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setMsg("仅支持 PNG、JPG、GIF 或 WebP 图片");
      return;
    }
    if (file.size > 200 * 1024) {
      setMsg("图片过大，请使用 200KB 以内的图片");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logoUrl: String(reader.result || "") }));
      setMsg("");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e) => {
    e.preventDefault();
    void save(form);
  };

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form onSubmit={handleSave}>
      <h2 className={styles.sectionTitle}>站点外观</h2>
      <div className={styles.formGrid}>
        <Field label="站点标题">
          {(id) => <input id={id} className={styles.input} value={form.siteTitle} onChange={set("siteTitle")}
            placeholder="例如：DATA STORE" maxLength={60} required />}
        </Field>
        <Field label="浏览器标签页标题">
          {(id) => <input id={id} className={styles.input} value={form.pageTitle} onChange={set("pageTitle")}
            placeholder="例如：DataStore - 数据小商店" maxLength={120} />}
        </Field>
        <Field label="Logo" hint="填写 HTTPS 图片地址，或上传 200KB 以内的 PNG / JPG / GIF / WebP 图片" full>
          {(id) => (
            <div className={styles.logoRow}>
              <div className={styles.previewBox} aria-hidden={!logoPreview}>
                {logoPreview ? (
                  <Image src={logoPreview} alt="Logo 预览" className={styles.previewImg} width={56} height={56} unoptimized />
                ) : (
                  <span className={styles.previewEmpty}>无</span>
                )}
              </div>
              <input id={id} className={styles.input} value={form.logoUrl.startsWith("data:") ? "（已上传图片）" : form.logoUrl}
                readOnly={form.logoUrl.startsWith("data:")} onChange={set("logoUrl")} placeholder="https://…" />
              <label className={styles.secondaryBtn}>
                上传
                <input type="file" accept={LOGO_TYPES.join(",")} onChange={handleFileChange} className={styles.visuallyHidden} />
              </label>
              {form.logoUrl && (
                <button type="button" className={styles.secondaryBtn} onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}>
                  清除
                </button>
              )}
            </div>
          )}
        </Field>
        <Field label="页脚文案" full>
          {(id) => <input id={id} className={styles.input} value={form.footerText} onChange={set("footerText")}
            placeholder="例如：© 2026 数据小商店 DataStore" maxLength={200} />}
        </Field>
        <Field label="关于我们（HTML）" hint="留空则不显示“关于我们”。脚本、事件属性等不安全内容会被自动移除。" full>
          {(id) => <textarea id={id} className={styles.textarea} value={form.aboutContent} onChange={set("aboutContent")}
            placeholder="<p>介绍你的产品、服务或团队</p>" />}
        </Field>
      </div>

      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? "保存中…" : "保存设置"}
        </button>
      </div>
      <FormError msg={msg} />
      <Notice text={notice} />
    </form>
  );
}

function ItemList({ title, emptyText, items, editingId, getTitle, getMeta, viewHref, deleteUrl, onEdit, onDeleted }) {
  return (
    <div className={styles.listBlock}>
      <h3 className={styles.listTitle}>{title}（{items.length}）</h3>
      {items.length === 0 ? (
        <p className={styles.emptyText}>{emptyText}</p>
      ) : (
        <ul className={styles.itemList}>
          {items.map((item) => (
            <li key={item.id} className={`${styles.item} ${editingId === item.id ? styles.itemEditing : ""}`}>
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>{getTitle(item)}</span>
                <span className={styles.itemMeta}>{getMeta(item)}</span>
              </div>
              <div className={styles.itemActions}>
                <a href={viewHref(item)} target="_blank" rel="noopener noreferrer" className={styles.viewBtn}>查看</a>
                <button type="button" className={styles.editBtn} onClick={() => {
                  onEdit(item);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}>
                  编辑
                </button>
                <DeleteBtn url={deleteUrl(item)} label={getTitle(item)} onDeleted={() => onDeleted(item)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DatasetAdminSection({ datasets, editingDataset, setEditingDataset, refresh }) {
  const [notice, flash] = useNotice();
  return (
    <>
      <DatasetForm
        key={editingDataset ? editingDataset.id : "new"}
        editingDataset={editingDataset}
        onSaved={async (text) => {
          await refresh();
          setEditingDataset(null);
          flash(text);
        }}
        onCancel={() => setEditingDataset(null)}
      />
      <Notice text={notice} />
      <ItemList
        title="已发布数据集"
        emptyText="还没有数据集，使用上方表单发布第一个。"
        items={datasets}
        editingId={editingDataset?.id}
        getTitle={(d) => d.name}
        getMeta={(d) => [formatPrice(d.price), formatDate(d.createdAt), ...(d.tags || [])].filter(Boolean).join(" · ")}
        viewHref={(d) => `/dataset/${encodeURIComponent(d.id)}`}
        deleteUrl={(d) => `/api/datasets/${encodeURIComponent(d.id)}`}
        onEdit={setEditingDataset}
        onDeleted={async (d) => {
          if (editingDataset?.id === d.id) setEditingDataset(null);
          await refresh();
          flash("已删除");
        }}
      />
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
    tags: Array.isArray(editingDataset?.tags) ? editingDataset.tags.join(", ") : "",
  });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const url = isEdit ? `/api/datasets/${encodeURIComponent(editingDataset.id)}` : "/api/datasets";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price || 0),
          tags: splitTags(form.tags),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.message || "保存失败");
        setSaving(false);
        return;
      }
      if (!isEdit) setForm({ name: "", description: "", richContent: "", price: "", baiduLink: "", tags: "" });
      await onSaved(isEdit ? "修改已保存" : "数据集已发布");
    } catch {
      setMsg("网络错误，请重试");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 className={styles.sectionTitle}>
        {isEdit ? `编辑数据集：${editingDataset.name}` : "发布数据集"}
      </h2>
      <div className={styles.formGrid}>
        <Field label="名称">
          {(id) => <input id={id} className={styles.input} value={form.name} onChange={set("name")} maxLength={120} required />}
        </Field>
        <Field label="价格（元）" hint="填 0 表示免费资源">
          {(id) => <input id={id} className={styles.input} type="number" inputMode="decimal" min="0" max="1000000" step="0.01"
            value={form.price} onChange={set("price")} placeholder="例如：29.90" required />}
        </Field>
        <Field label="简述" hint="显示在首页卡片上，最多 1000 字" full>
          {(id) => <input id={id} className={styles.input} value={form.description} onChange={set("description")} maxLength={1000} required />}
        </Field>
        <Field label="图文详情（HTML，可选）" hint="支持段落、标题、列表、表格、图片和链接；脚本与事件属性会被自动移除" full>
          {(id) => <textarea id={id} className={styles.textarea} value={form.richContent} onChange={set("richContent")}
            placeholder="<p>数据来源、字段说明、更新频率…</p>" />}
        </Field>
        <Field label="网盘 / 下载链接" hint="仅向已购买用户展示，必须是 HTTPS 地址">
          {(id) => <input id={id} className={styles.input} type="url" inputMode="url" value={form.baiduLink} onChange={set("baiduLink")}
            placeholder="https://pan.baidu.com/s/…" required />}
        </Field>
        <Field label="标签（逗号分隔，可选）">
          {(id) => <input id={id} className={styles.input} value={form.tags} onChange={set("tags")} placeholder="例如：人口, 宏观经济" />}
        </Field>
      </div>
      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? "提交中…" : isEdit ? "保存修改" : "立即发布"}
        </button>
        {isEdit && (
          <button type="button" onClick={onCancel} className={styles.secondaryBtn}>
            取消编辑
          </button>
        )}
      </div>
      <FormError msg={msg} />
    </form>
  );
}

function ArticleAdminSection({ articles, editingArticle, setEditingArticle, refresh }) {
  const [notice, flash] = useNotice();
  return (
    <>
      <ArticleForm
        key={editingArticle ? editingArticle.id : "new"}
        editingArticle={editingArticle}
        onSaved={async (text) => {
          await refresh();
          setEditingArticle(null);
          flash(text);
        }}
        onCancel={() => setEditingArticle(null)}
      />
      <Notice text={notice} />
      <ItemList
        title="已发布文章"
        emptyText="还没有文章，使用上方表单发布第一篇。"
        items={articles}
        editingId={editingArticle?.id}
        getTitle={(a) => a.title}
        getMeta={(a) => [formatDate(a.createdAt), ...(a.tags || [])].filter(Boolean).join(" · ")}
        viewHref={(a) => `/article/${encodeURIComponent(a.id)}`}
        deleteUrl={(a) => `/api/articles/${encodeURIComponent(a.id)}`}
        onEdit={setEditingArticle}
        onDeleted={async (a) => {
          if (editingArticle?.id === a.id) setEditingArticle(null);
          await refresh();
          flash("已删除");
        }}
      />
    </>
  );
}

function ArticleForm({ editingArticle, onSaved, onCancel }) {
  const isEdit = !!editingArticle;
  const [form, setForm] = useState({
    title: editingArticle?.title || "",
    summary: editingArticle?.summary || "",
    content: editingArticle?.content || "",
    tags: Array.isArray(editingArticle?.tags) ? editingArticle.tags.join(", ") : "",
  });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg("");
    try {
      const url = isEdit ? `/api/articles/${encodeURIComponent(editingArticle.id)}` : "/api/articles";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags: splitTags(form.tags) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.message || "保存失败");
        setSaving(false);
        return;
      }
      if (!isEdit) setForm({ title: "", summary: "", content: "", tags: "" });
      await onSaved(isEdit ? "修改已保存" : "文章已发布");
    } catch {
      setMsg("网络错误，请重试");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={onSubmit}>
      <h2 className={styles.sectionTitle}>{isEdit ? `编辑文章：${editingArticle.title}` : "发布文章"}</h2>
      <div className={styles.formGrid}>
        <Field label="标题" full>
          {(id) => <input id={id} className={styles.input} value={form.title} onChange={set("title")} maxLength={120} required />}
        </Field>
        <Field label="摘要（可选）" hint="显示在首页卡片上，最多 500 字" full>
          {(id) => <input id={id} className={styles.input} value={form.summary} onChange={set("summary")} maxLength={500} />}
        </Field>
        <Field label="正文（HTML）" hint="支持段落、标题、列表、引用、表格、图片和链接；脚本与事件属性会被自动移除" full>
          {(id) => <textarea id={id} className={`${styles.textarea} ${styles.textareaTall}`} value={form.content}
            onChange={set("content")} placeholder="<p>正文内容…</p>" required />}
        </Field>
        <Field label="标签（逗号分隔，可选）" full>
          {(id) => <input id={id} className={styles.input} value={form.tags} onChange={set("tags")} placeholder="例如：教程, 数据" />}
        </Field>
      </div>
      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={saving}>
          {saving ? "提交中…" : isEdit ? "保存修改" : "发布文章"}
        </button>
        {isEdit && (
          <button type="button" onClick={onCancel} className={styles.secondaryBtn}>
            取消编辑
          </button>
        )}
      </div>
      <FormError msg={msg} />
    </form>
  );
}

function DeleteBtn({ url, label, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (deleting || !confirm(`确定要删除“${label}”吗？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        await onDeleted();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "删除失败，请重试");
      }
    } catch {
      alert("网络错误，请重试");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
      {deleting ? "删除中…" : "删除"}
    </button>
  );
}
