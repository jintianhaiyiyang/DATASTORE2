// lib/db.js
import { kv } from "@vercel/kv";

// 1. 数据集 (Datasets) 管理 —— 解决 (0, i.getDatasets) 报错
export async function getDatasets() {
  try {
    const datasets = await kv.get("datasets");
    // 如果云端还没有数据，返回一个默认列表供演示
    const DEFAULT_DATASETS = [
      { id: 1, name: "2024全球金融报告", price: 0.01 },
      { id: 2, name: "全球气候数据", price: 0.01 },
      { id: 3, name: "测试数据集", price: 0.02 } // 确保这里价格正确
    ];
    return Array.isArray(datasets) ? datasets : DEFAULT_DATASETS;
  } catch (error) {
    console.error("KV 获取数据集失败:", error);
    return [];
  }
}

// 2. 用户数据 (Users) 管理
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
  users.push(newUser);
  await kv.set("users", users);
  return newUser;
}

// 3. 购买记录更新
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
