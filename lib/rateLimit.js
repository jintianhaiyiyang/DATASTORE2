import { kv } from "@vercel/kv";

export async function consumeRateLimit(key, { limit, windowSeconds }) {
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, windowSeconds);
    let ttl = await kv.ttl(key);
    if (!Number.isFinite(ttl) || ttl < 0) {
      await kv.expire(key, windowSeconds);
      ttl = windowSeconds;
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfter: ttl,
    };
  } catch (error) {
    console.error("Rate limiter unavailable:", error);
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, remaining: 0, retryAfter: windowSeconds };
    }
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

export async function clearRateLimit(key) {
  try {
    await kv.del(key);
  } catch (error) {
    console.error("Failed to clear rate limit:", error);
  }
}
