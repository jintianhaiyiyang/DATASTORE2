import fs from "fs";
import path from "path";
import { withIronSessionApiRoute } from "../../../lib/session";

const filePath = path.join(process.cwd(), "data", "datasets.json");
const usersPath = path.join(process.cwd(), "data", "users.json");

async function datasetDetailHandler(req, res) {
  const { id } = req.query;
  const sessionUser = req.session.user;

  // 1. 读取数据集
  let datasets = [];
  try {
    if (fs.existsSync(filePath)) {
      datasets = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
    }
  } catch (e) {
    return res.status(500).json({ message: "数据读取失败" });
  }

  const dataset = datasets.find((d) => d.id.toString() === id.toString());
  if (!dataset) return res.status(404).json({ message: "数据集不存在" });

  // 2. 权限校验逻辑
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const isAdmin = sessionUser?.isLoggedIn && sessionUser.username === adminUsername;
  
  let isPaid = isAdmin || Number(dataset.price) === 0; // 管理员或免费资源默认已购

  if (!isPaid && sessionUser?.isLoggedIn) {
    // 检查普通用户的购买记录
    try {
      const users = JSON.parse(fs.readFileSync(usersPath, "utf8") || "[]");
      const user = users.find(u => u.email === sessionUser.email);
      if (user?.purchasedIds?.includes(Number(id))) {
        isPaid = true;
      }
    } catch (e) { console.error("读取用户记录失败"); }
  }

  // 3. GET 请求：返回脱敏后的数据
  if (req.method === "GET") {
    const { baiduLink, ...publicData } = dataset;
    return res.status(200).json({
      ...publicData,
      isPaid,
      // 只有付过款才返回真实的链接
      downloadUrl: isPaid ? baiduLink : null 
    });
  }

  res.setHeader("Allow", ["GET"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

export default withIronSessionApiRoute(datasetDetailHandler);