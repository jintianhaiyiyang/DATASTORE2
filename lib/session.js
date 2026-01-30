// lib/session.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  // ❗️ 确保 .env.local 里配置了 32位以上 的 COOKIE_PASSWORD
  password: process.env.COOKIE_PASSWORD,
  cookieName: "data_store_session",
  cookieOptions: {
    // 生产环境强制 HTTPS
    secure: process.env.NODE_ENV === "production",
    // 必须为 true，防止 JS 读取
    httpOnly: true,
    sameSite: "lax",
  },
};

// 我们手动写一个 Wrapper (包装器)，来模拟旧版的用法
// 这样你的 login.js, articles/index.js 都不用改
export function withIronSessionApiRoute(handler) {
  return async function (req, res) {
    // 1. 获取会话
    const session = await getIronSession(req, res, sessionOptions);
    
    // 2. 把 session 挂载到 req 对象上，方便后续代码调用
    req.session = session;
    
    // 3. 继续执行原来的 API 逻辑
    return handler(req, res);
  };
}
