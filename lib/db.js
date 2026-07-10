import { kv } from "@vercel/kv";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";

// Short in-process cache so SSR on consecutive page loads doesn't re-hit KV every time
const SITE_SETTINGS_CACHE_TTL_MS = 30000;
let siteSettingsCache = null;
let siteSettingsCacheAt = 0;

const DEFAULT_DATASETS = [
  {
    id: 1,
    name: "2024全球金融报告",
    price: 0.01,
    description: "演示数据：金融数据。",
    downloadUrl: "https://pan.baidu.com/s/1",
    baiduLink: "https://pan.baidu.com/s/1",
  },
  {
    id: 2,
    name: "全球气候数据",
    price: 0.01,
    description: "演示数据：气候变化。",
    downloadUrl: "https://pan.baidu.com/s/2",
    baiduLink: "https://pan.baidu.com/s/2",
  },
];

function sameId(a, b) {
  return String(a) === String(b);
}

// =======================
// 1. 文章管理 (Articles)
// =======================
export async function getArticles() {
  try {
    const articles = await kv.get("articles");
    return Array.isArray(articles) ? articles : [];
  } catch (error) {
    console.error("KV 获取文章失败:", error);
    return [];
  }
}

export async function saveArticle(newArticle) {
  const articles = await getArticles();
  articles.unshift(newArticle);
  await kv.set("articles", articles);
  return newArticle;
}

export async function updateArticle(id, updatedData) {
  const articles = await getArticles();
  const index = articles.findIndex((a) => sameId(a.id, id));
  if (index !== -1) {
    // Never allow client to overwrite primary key
    const { id: _ignore, ...safeData } = updatedData || {};
    articles[index] = { ...articles[index], ...safeData, id: articles[index].id };
    await kv.set("articles", articles);
    return articles[index];
  }
  return null;
}

export async function deleteArticle(id) {
  const articles = await getArticles();
  const newArticles = articles.filter((a) => !sameId(a.id, id));
  await kv.set("articles", newArticles);
  return true;
}

// =======================
// 2. 数据集管理 (Datasets)
// =======================
export async function getDatasets() {
  try {
    let datasets = await kv.get("datasets");
    // Seed demo data once so items are real (editable/deletable) records
    if (!Array.isArray(datasets)) {
      datasets = DEFAULT_DATASETS;
      try {
        await kv.set("datasets", datasets);
      } catch (seedError) {
        console.error("KV 初始化默认数据集失败:", seedError);
      }
    }
    return datasets;
  } catch (error) {
    console.error("KV 获取数据集失败:", error);
    return [...DEFAULT_DATASETS];
  }
}

export async function saveDataset(newDataset) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  datasets.unshift(newDataset);
  await kv.set("datasets", datasets);
  return newDataset;
}

export async function updateDataset(id, updatedData) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  const index = datasets.findIndex((d) => sameId(d.id, id));
  if (index !== -1) {
    const { id: _ignore, ...safeData } = updatedData || {};
    // Keep downloadUrl in sync when baiduLink is updated
    if (safeData.baiduLink && !safeData.downloadUrl) {
      safeData.downloadUrl = safeData.baiduLink;
    }
    datasets[index] = { ...datasets[index], ...safeData, id: datasets[index].id };
    await kv.set("datasets", datasets);
    return datasets[index];
  }
  return null;
}

export async function deleteDataset(id) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  const newDatasets = datasets.filter((d) => !sameId(d.id, id));
  await kv.set("datasets", newDatasets);
  return true;
}

// =======================
// 3. 用户管理 (Users)
// =======================
export async function getUsers() {
  try {
    const users = await kv.get("users");
    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error("KV 获取用户失败:", error);
    return [];
  }
}

export async function saveUser(newUser) {
  const users = await getUsers();
  const email = String(newUser.email || "").trim().toLowerCase();
  if (!email) {
    throw new Error("邮箱不能为空");
  }
  if (users.find((u) => u.email === email)) {
    throw new Error("该邮箱已注册");
  }
  const sanitizedUser = sanitizeUserForStorage({ ...newUser, email });
  users.push(sanitizedUser);
  await kv.set("users", users.map(sanitizeUserForStorage));
  return sanitizedUser;
}

export async function updateUserByEmail(email, updatedData) {
  const users = await getUsers();
  const normalized = String(email || "").trim().toLowerCase();
  const index = users.findIndex((u) => u.email === normalized);

  if (index !== -1) {
    const { password, ...safeData } = updatedData || {};
    // Drop legacy plaintext password once passwordHash is set
    users[index] = { ...users[index], ...safeData };
    if (safeData.passwordHash) {
      delete users[index].password;
    }
    const sanitizedUsers = users.map(sanitizeUserForStorage);
    await kv.set("users", sanitizedUsers);
    return sanitizedUsers[index];
  }
  return null;
}

export async function updateUserPurchase(email, datasetId) {
  if (!email) return false;
  const users = await getUsers();
  const normalized = String(email || "").trim().toLowerCase();
  const userIndex = users.findIndex((u) => u.email === normalized);

  if (userIndex === -1) return false;

  if (!Array.isArray(users[userIndex].purchasedIds)) {
    users[userIndex].purchasedIds = [];
  }

  // Store IDs as strings for stable comparison across number/string sources
  const id = String(datasetId);
  const already = users[userIndex].purchasedIds.map(String).includes(id);
  if (!already) {
    users[userIndex].purchasedIds.push(datasetId);
    await kv.set("users", users.map(sanitizeUserForStorage));
  }
  return true;
}

function sanitizeUserForStorage(user) {
  if (!user || typeof user !== "object") return user;
  // Never persist plaintext passwords
  const { password, ...rest } = user;
  return rest;
}

// =======================
// 4. 站点设置 (Site Settings)
// =======================
export async function getSiteSettings() {
  try {
    const now = Date.now();
    if (siteSettingsCache && now - siteSettingsCacheAt < SITE_SETTINGS_CACHE_TTL_MS) {
      return { ...siteSettingsCache };
    }
    const settings = await kv.get("site_settings");
    if (!settings || typeof settings !== "object") {
      const fallback = { ...DEFAULT_SITE_SETTINGS };
      siteSettingsCache = fallback;
      siteSettingsCacheAt = now;
      return fallback;
    }
    const merged = { ...DEFAULT_SITE_SETTINGS, ...settings };
    siteSettingsCache = merged;
    siteSettingsCacheAt = now;
    return merged;
  } catch (error) {
    console.error("KV 获取站点设置失败:", error);
    return { ...DEFAULT_SITE_SETTINGS };
  }
}

export async function saveSiteSettings(updatedSettings) {
  const current = await getSiteSettings();
  const merged = {
    ...current,
    ...updatedSettings,
    updatedAt: new Date().toISOString(),
  };
  await kv.set("site_settings", merged);
  siteSettingsCache = merged;
  siteSettingsCacheAt = Date.now();
  return merged;
}
