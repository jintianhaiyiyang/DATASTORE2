import fs from "fs";
import path from "path";
import { withIronSessionApiRoute } from "../../../lib/session";

const usersFilePath = path.join(process.cwd(), "data", "users.json");

// 确保存储目录和文件存在
function ensureDataFile() {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify([], null, 2));
  }
}

async function registerHandler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, otp, password } = req.body;

  // 1. 基础校验
  if (!email || !otp || !password) {
    return res.status(400).json({ message: "请填写完整注册信息" });
  }

  // 2. 校验验证码：从 Session 中读取 send-otp 接口存入的数据
  const sessionOtp = req.session.otp;
  if (!sessionOtp || sessionOtp.email !== email) {
    return res.status(400).json({ message: "验证码与邮箱不匹配" });
  }
  if (sessionOtp.code !== otp) {
    return res.status(400).json({ message: "验证码错误" });
  }
  if (Date.now() > sessionOtp.expires) {
    return res.status(400).json({ message: "验证码已过期" });
  }

  // 3. 读取用户库并校验是否已存在
  ensureDataFile();
  const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: "该邮箱已注册" });
  }

  // 4. 创建新用户
  const newUser = {
    email,
    password, // 开发阶段演示，生产环境建议使用 bcrypt 加密
    username: email.split("@")[0],
    purchasedIds: [], // 初始化已购列表 [cite: 343]
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

  // 5. 清除验证码 Session 并自动登录
  req.session.otp = null;
  req.session.user = {
    username: newUser.username,
    email: newUser.email,
    isLoggedIn: true
  };
  await req.session.save();

  return res.status(200).json({ success: true, message: "注册成功" });
}

export default withIronSessionApiRoute(registerHandler);