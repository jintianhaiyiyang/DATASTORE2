import { kv } from "@vercel/kv";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";

const SITE_SETTINGS_CACHE_TTL_MS = 5000;
let siteSettingsCache = null;
let siteSettingsCacheAt = 0;

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
  const index = articles.findIndex(a => String(a.id) === String(id));
  if (index !== -1) {
    articles[index] = { ...articles[index], ...updatedData };
    await kv.set("articles", articles);
    return articles[index];
  }
  return null;
}

export async function deleteArticle(id) {
  const articles = await getArticles();
  const newArticles = articles.filter(a => String(a.id) !== String(id));
  await kv.set("articles", newArticles);
  return true;
}

// =======================
// 2. 数据集管理 (Datasets) —— 🟢 新增修改/删除
// =======================
export async function getDatasets() {
  try {
    const datasets = await kv.get("datasets");
    // 演示默认数据
    const DEFAULT_DATASETS = [
      { id: 1, name: "2024全球金融报告", price: 0.01, description: "演示数据：金融数据。", downloadUrl: "https://pan.baidu.com/s/1" },
      { id: 2, name: "全球气候数据", price: 0.01, description: "演示数据：气候变化。", downloadUrl: "https://pan.baidu.com/s/2" }
    ];
    return Array.isArray(datasets) ? datasets : DEFAULT_DATASETS;
  } catch (error) {
    console.error("KV 获取数据集失败:", error);
    return [];
  }
}

export async function saveDataset(newDataset) {
  // 注意：保存时我们需要先获取纯净的KV数据，避免把默认数据写进去
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];
  
  datasets.unshift(newDataset);
  await kv.set("datasets", datasets);
  return newDataset;
}

// 🟢 新增：更新数据集
export async function updateDataset(id, updatedData) {
  // 获取数据（含默认）用于查找，但保存时要小心
  // 为了简单，我们这里假设只操作 KV 里的数据。如果 ID 是 1/2/3 这种默认数据，无法修改是正常的。
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  const index = datasets.findIndex(d => Number(d.id) === Number(id));
  if (index !== -1) {
    datasets[index] = { ...datasets[index], ...updatedData };
    await kv.set("datasets", datasets);
    return datasets[index];
  }
  return null;
}

// 🟢 新增：删除数据集
export async function deleteDataset(id) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];
  
  const newDatasets = datasets.filter(d => Number(d.id) !== Number(id));
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
  if (users.find(u => u.email === newUser.email)) {
    throw new Error("该邮箱已注册");
  }
  const sanitizedUser = sanitizeUserForStorage(newUser);
  users.push(sanitizedUser);
  await kv.set("users", users.map(sanitizeUserForStorage));
  return sanitizedUser;
}

export async function updateUserByEmail(email, updatedData) {
  const users = await getUsers();
  const index = users.findIndex(u => u.email === email);

  if (index !== -1) {
    users[index] = { ...users[index], ...updatedData };
    const sanitizedUsers = users.map(sanitizeUserForStorage);
    await kv.set("users", sanitizedUsers);
    return sanitizedUsers[index];
  }
  return null;
}

export async function updateUserPurchase(email, datasetId) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.email === email);
  
  if (userIndex !== -1) {
    if (!users[userIndex].purchasedIds) users[userIndex].purchasedIds = [];
    const id = Number(datasetId);
    if (!users[userIndex].purchasedIds.includes(id)) {
      users[userIndex].purchasedIds.push(id);
      await kv.set("users", users.map(sanitizeUserForStorage));
    }
  }
}

function sanitizeUserForStorage(user) {
  if (!user || typeof user !== "object") return user;
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
