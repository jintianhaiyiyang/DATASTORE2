import { kv } from "@vercel/kv";

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
  // 把新文章插到最前面 (unshift)
  articles.unshift(newArticle); 
  await kv.set("articles", articles);
  return newArticle;
}

// =======================
// 2. 数据集管理 (Datasets)
// =======================
export async function getDatasets() {
  try {
    const datasets = await kv.get("datasets");
    // 如果云端还没有数据，返回一些默认的演示数据
    const DEFAULT_DATASETS = [
      { 
        id: 1, 
        name: "2024全球金融报告", 
        price: 0.01, 
        description: "包含全球主要经济体的年度金融数据。",
        downloadUrl: "https://pan.baidu.com/s/example_link_1" 
      },
      { 
        id: 2, 
        name: "全球气候数据", 
        price: 0.01, 
        description: "过去50年的气温与降水变化数据。",
        downloadUrl: "https://pan.baidu.com/s/example_link_2" 
      },
      { 
        id: 3, 
        name: "测试数据集 (0.02元)", 
        price: 0.02, 
        description: "用于测试支付功能的专用数据集。",
        downloadUrl: "https://pan.baidu.com/s/example_link_3_real_download" 
      }
    ];
    return Array.isArray(datasets) ? datasets : DEFAULT_DATASETS;
  } catch (error) {
    console.error("KV 获取数据集失败:", error);
    return [];
  }
}

export async function saveDataset(newDataset) {
  // 注意：这里我们通过 getDatasets 获取，但不包含默认数据，避免把默认数据重复写入
  // 建议直接从 KV 裸取一次，或者简单处理：
  let datasets = await kv.get("datasets");
  if (!Array.isArray(datasets)) datasets = [];
  
  datasets.unshift(newDataset);
  await kv.set("datasets", datasets);
  return newDataset;
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
  users.push(newUser);
  await kv.set("users", users);
  return newUser;
}

export async function updateUserPurchase(email, datasetId) {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.email === email);
  
  if (userIndex !== -1) {
    if (!users[userIndex].purchasedIds) users[userIndex].purchasedIds = [];
    
    const id = Number(datasetId);
    if (!users[userIndex].purchasedIds.includes(id)) {
      users[userIndex].purchasedIds.push(id);
      await kv.set("users", users);
      console.log(`[DB] 用户 ${email} 成功解锁资源 ${id}`);
    }
  }
}
