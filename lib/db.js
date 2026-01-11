// lib/db.js
import { kv } from "@vercel/kv";

/**
 * 获取所有用户 (从云端 Vercel KV)
 */
export async function getUsers() {
  try {
    const users = await kv.get("users");
    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error("KV 获取用户失败:", error);
    return [];
  }
}

/**
 * 保存新用户到云端
 */
export async function saveUser(newUser) {
  const users = await getUsers();
  // 检查邮箱是否已存在
  if (users.find(u => u.email === newUser.email)) {
    throw new Error("该邮箱已注册");
  }
  users.push(newUser);
  await kv.set("users", users);
  return newUser;
}

/**
 * 更新用户购买权限
 */
export async function updateUserPurchase(email, datasetId) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.email === email);
  
  if (userIndex !== -1) {
    if (!users[userIndex].purchasedIds) users[userIndex].purchasedIds = [];
    if (!users[userIndex].purchasedIds.includes(datasetId)) {
      users[userIndex].purchasedIds.push(datasetId);
      await kv.set("users", users);
    }
  }
}
