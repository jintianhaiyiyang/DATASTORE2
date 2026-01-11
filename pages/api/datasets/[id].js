import { withIronSessionApiRoute } from "../../../lib/session";
import { getDatasets, getUsers } from "../../../lib/db";

async function singleDatasetRoute(req, res) {
  const { id } = req.query;
  const datasetId = Number(id);

  try {
    // 1. 获取所有数据集
    const datasets = await getDatasets();
    const dataset = datasets.find((d) => d.id === datasetId);

    if (!dataset) {
      return res.status(404).json({ message: "资源不存在" });
    }

    // 2. 检查权限 (核心修改)
    let isPaid = false;
    const user = req.session.user;

    if (user && user.isLoggedIn) {
      // 🟢 关键：不要只看 Session，要去 KV 数据库查最新的用户数据
      // 因为 Session 里的数据可能是登录时存的旧数据
      const allUsers = await getUsers();
      const freshUser = allUsers.find(u => u.email === user.email);

      if (freshUser && freshUser.purchasedIds && freshUser.purchasedIds.includes(datasetId)) {
        isPaid = true;
      }
    }

    // 3. 构建返回数据
    // 如果没付钱，就把 downloadUrl 藏起来，不返回给前端
    const { downloadUrl, ...publicData } = dataset;

    res.json({
      ...publicData,
      isPaid: isPaid, // 告诉前端是否已解锁
      downloadUrl: isPaid ? downloadUrl : null, // 只有解锁了才给链接
    });

  } catch (error) {
    console.error("获取详情失败:", error);
    res.status(500).json({ message: "服务器错误" });
  }
}

export default withIronSessionApiRoute(singleDatasetRoute);
