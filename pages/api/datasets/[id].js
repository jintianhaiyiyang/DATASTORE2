import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, updateDataset, deleteDataset, getUsers } from "../../../lib/db";

async function handler(req, res) {
  const { id } = req.query;
  const user = req.session.user;
  const isLoggedIn = user && user.isLoggedIn;
  const isAdmin = isLoggedIn && user.isAdmin; // 只有管理员能改

  // --- GET: 获取单个详情 ---
  if (req.method === "GET") {
    const datasets = await getDatasets();
    const dataset = datasets.find(d => Number(d.id) === Number(id));
    if (!dataset) return res.status(404).json({ message: "资源不存在" });

    // 权限检查：是否已购买
    let purchasedIds = [];
    if (isLoggedIn) {
      const allUsers = await getUsers();
      const currentUser = allUsers.find(u => u.email === user.email);
      purchasedIds = currentUser?.purchasedIds || [];
    }
    
    const isPaid = isLoggedIn && purchasedIds.includes(Number(id));
    const isFree = Number(dataset.price) === 0;
    const hasAccess = isPaid || isFree || isAdmin;

    const { baiduLink, downloadUrl, ...rest } = dataset;
    const realLink = baiduLink || downloadUrl;

    return res.json({
      ...rest,
      isPaid: hasAccess,
      downloadUrl: hasAccess ? realLink : null
    });
  }

  // --- PUT: 修改数据集 (管理员) ---
  if (req.method === "PUT") {
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });
    
    try {
      // 这里的 req.body 包含了要修改的字段
      const updated = await updateDataset(id, req.body);
      if (updated) return res.json(updated);
      return res.status(404).json({ message: "更新失败，未找到该数据集" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  // --- DELETE: 删除数据集 (管理员) ---
  if (req.method === "DELETE") {
    if (!isAdmin) return res.status(403).json({ message: "无权操作" });
    
    try {
      await deleteDataset(id);
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withIronSessionApiRoute(handler);
