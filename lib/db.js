import { kv } from "@vercel/kv";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";
import {
  sanitizeArticle,
  sanitizeDataset,
  sanitizeRichText,
} from "./content";
import { hashKey, normalizeEmail } from "./security";

// Short in-process cache so SSR on consecutive page loads doesn't re-hit KV every time
const SITE_SETTINGS_CACHE_TTL_MS = 30000;
let siteSettingsCache = null;
let siteSettingsCacheAt = 0;

function sameId(a, b) {
  return String(a) === String(b);
}

// =======================
// 1. 文章管理 (Articles)
// =======================
export async function getArticles() {
  const articles = await kv.get("articles");
  return Array.isArray(articles) ? articles.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map(sanitizeArticle) : [];
}

export async function saveArticle(newArticle) {
  const articles = await getArticles();
  const safeArticle = sanitizeArticle(newArticle);
  articles.unshift(safeArticle);
  await kv.set("articles", articles);
  return safeArticle;
}

export async function updateArticle(id, updatedData) {
  const articles = await getArticles();
  const index = articles.findIndex((a) => sameId(a.id, id));
  if (index !== -1) {
    // Never allow client to overwrite primary key
    const { id: _ignore, ...safeData } = updatedData || {};
    articles[index] = sanitizeArticle({
      ...articles[index],
      ...safeData,
      id: articles[index].id,
    });
    await kv.set("articles", articles);
    return articles[index];
  }
  return null;
}

export async function deleteArticle(id) {
  const articles = await getArticles();
  const newArticles = articles.filter((a) => !sameId(a.id, id));
  if (newArticles.length === articles.length) return false;
  await kv.set("articles", newArticles);
  return true;
}

// =======================
// 2. 数据集管理 (Datasets)
// =======================
export async function getDatasets() {
  const datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) return [];
  return datasets.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map(sanitizeDataset);
}

export async function saveDataset(newDataset) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  const safeDataset = sanitizeDataset(newDataset);
  datasets.unshift(safeDataset);
  await kv.set("datasets", datasets);
  return safeDataset;
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
    datasets[index] = sanitizeDataset({
      ...datasets[index],
      ...safeData,
      id: datasets[index].id,
    });
    await kv.set("datasets", datasets);
    return datasets[index];
  }
  return null;
}

export async function deleteDataset(id) {
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];

  const newDatasets = datasets.filter((d) => !sameId(d.id, id));
  if (newDatasets.length === datasets.length) return false;
  await kv.set("datasets", newDatasets);
  return true;
}

// =======================
// 3. 用户管理 (Users)
// =======================
export async function getUsers() {
  const users = await kv.get("users");
  return Array.isArray(users) ? users.map(sanitizeUserForStorage) : [];
}

function userKey(email) {
  return `user:${hashKey(normalizeEmail(email))}`;
}

function purchaseKey(email) {
  return `purchases:${hashKey(normalizeEmail(email))}`;
}

export async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const direct = await kv.get(userKey(normalized));
  if (direct && typeof direct === "object") return sanitizeUserForStorage(direct);
  const users = await getUsers();
  const legacy = users.find((user) => normalizeEmail(user.email) === normalized) || null;
  if (legacy) await kv.set(userKey(normalized), legacy, { nx: true });
  return legacy;
}

export async function getUserByLogin(login) {
  const normalized = String(login || "").trim().toLowerCase();
  if (normalized.includes("@")) return getUserByEmail(normalized);
  const users = await getUsers();
  return users.find((user) => String(user.username || "").toLowerCase() === normalized) || null;
}

export async function saveUser(newUser) {
  const users = await getUsers();
  const email = normalizeEmail(newUser.email);
  if (!email) {
    throw new Error("邮箱不能为空");
  }
  if (users.find((u) => normalizeEmail(u.email) === email)) {
    throw new Error("该邮箱已注册");
  }
  const sanitizedUser = sanitizeUserForStorage({ ...newUser, email });
  const claimed = await kv.set(userKey(email), sanitizedUser, { nx: true });
  if (!claimed) throw new Error("该邮箱已注册");
  try {
    users.push(sanitizedUser);
    await kv.set("users", users.map(sanitizeUserForStorage));
  } catch (error) {
    await kv.del(userKey(email));
    throw error;
  }
  return sanitizedUser;
}

export async function updateUserByEmail(email, updatedData) {
  const users = await getUsers();
  const normalized = normalizeEmail(email);
  const index = users.findIndex((u) => normalizeEmail(u.email) === normalized);

  if (index !== -1) {
    const { password, ...safeData } = updatedData || {};
    // Drop legacy plaintext password once passwordHash is set
    users[index] = { ...users[index], ...safeData };
    if (safeData.passwordHash) {
      delete users[index].password;
    }
    const sanitizedUsers = users.map(sanitizeUserForStorage);
    await kv.set("users", sanitizedUsers);
    await kv.set(userKey(normalized), sanitizedUsers[index]);
    return sanitizedUsers[index];
  }
  return null;
}

export async function updateUserPurchase(email, datasetId) {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const user = await getUserByEmail(normalized);
  if (!user) return false;

  const id = String(datasetId);
  await kv.sadd(purchaseKey(normalized), id);

  try {
    // Maintain the legacy array during migration. The Redis set above is the
    // authoritative, atomic record and cannot lose concurrent purchases.
    const users = await getUsers();
    const userIndex = users.findIndex((u) => normalizeEmail(u.email) === normalized);
    if (userIndex === -1) return true;

    if (!Array.isArray(users[userIndex].purchasedIds)) {
      users[userIndex].purchasedIds = [];
    }
    const already = users[userIndex].purchasedIds.map(String).includes(id);
    if (!already) {
      users[userIndex].purchasedIds.push(id);
      await kv.set("users", users.map(sanitizeUserForStorage));
      await kv.set(userKey(normalized), sanitizeUserForStorage(users[userIndex]));
    }
  } catch (error) {
    // The atomic set is authoritative; a legacy mirror failure must not make
    // a valid payment notification retry forever.
    console.error("同步旧购买记录失败:", error);
  }
  return true;
}

export async function getPurchasedIds(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const user = await getUserByEmail(normalized);
  if (!user) return [];
  const legacy = Array.isArray(user.purchasedIds) ? user.purchasedIds.map(String) : [];
  const stored = await kv.smembers(purchaseKey(normalized));
  const merged = [...new Set([...legacy, ...(Array.isArray(stored) ? stored.map(String) : [])])];
  if (legacy.length) await kv.sadd(purchaseKey(normalized), ...legacy);
  return merged;
}

const ORDER_TTL_SECONDS = 7 * 24 * 60 * 60;

function orderKey(orderId) {
  return `order:${String(orderId)}`;
}

export async function saveOrder(order) {
  const stored = { ...order, status: "pending", createdAt: new Date().toISOString() };
  const created = await kv.set(orderKey(order.id), stored, {
    nx: true,
    ex: ORDER_TTL_SECONDS,
  });
  if (!created) throw new Error("订单号冲突");
  return stored;
}

export async function getOrder(orderId) {
  const order = await kv.get(orderKey(orderId));
  return order && typeof order === "object" ? order : null;
}

export async function markOrderPaid(orderId, transactionId) {
  const order = await getOrder(orderId);
  if (!order) return null;
  const updated = {
    ...order,
    status: "paid",
    transactionId: String(transactionId || ""),
    paidAt: new Date().toISOString(),
  };
  await kv.set(orderKey(orderId), updated, { ex: ORDER_TTL_SECONDS });
  return updated;
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
    const merged = {
      ...DEFAULT_SITE_SETTINGS,
      ...settings,
      aboutContent: sanitizeRichText(settings.aboutContent),
    };
    siteSettingsCache = merged;
    siteSettingsCacheAt = now;
    return merged;
  } catch (error) {
    console.error("KV 获取站点设置失败:", error?.message || error);
    const fallback = { ...DEFAULT_SITE_SETTINGS };
    siteSettingsCache = fallback;
    siteSettingsCacheAt = Date.now();
    return fallback;
  }
}

export async function saveSiteSettings(updatedSettings) {
  // A failed read must abort a write, never replace saved settings with the
  // public display fallback or with another instance's stale cache.
  const stored = await kv.get("site_settings");
  const current = { ...DEFAULT_SITE_SETTINGS, ...(stored || {}) };
  const merged = {
    ...current,
    ...updatedSettings,
    aboutContent: sanitizeRichText(updatedSettings.aboutContent ?? current.aboutContent),
    updatedAt: new Date().toISOString(),
  };
  await kv.set("site_settings", merged);
  siteSettingsCache = merged;
  siteSettingsCacheAt = Date.now();
  return merged;
}
