import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveUser: vi.fn(), rate: vi.fn() }));
vi.mock("../lib/session", () => ({ withIronSessionApiRoute: (handler) => handler }));
vi.mock("../lib/db", () => ({ saveUser: mocks.saveUser }));
vi.mock("../lib/rateLimit", () => ({ consumeRateLimit: mocks.rate }));

import register from "../pages/api/auth/register";

const issued = { email: "new@example.com", code: "123456", expires: Date.now() + 60000, attempts: 0 };

function request(body) {
  return {
    method: "POST",
    headers: { origin: "https://shop.example", host: "shop.example", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.8" },
    body: { email: issued.email, password: "long-enough-password", ...body },
    session: { otp: { ...issued }, save: vi.fn() },
  };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
  mocks.saveUser.mockImplementation(async (user) => user);
});

describe("registration code verification", () => {
  it("limits guesses server-side even when a replayed cookie reports zero attempts", async () => {
    mocks.rate.mockImplementation(async (key) => ({ allowed: !key.startsWith("rate:register:otp:"), remaining: 0, retryAfter: 60 }));
    const res = response();
    await register(request({ otp: "123456" }), res);
    expect(res.statusCode).toBe(429);
    expect(mocks.saveUser).not.toHaveBeenCalled();
  });

  it("scopes the attempt counter to the issued code", async () => {
    await register(request({ otp: "000000" }), response());
    const otpKeys = mocks.rate.mock.calls.map(([key]) => key).filter((key) => key.startsWith("rate:register:otp:"));
    expect(otpKeys).toHaveLength(1);
    const req = request({ otp: "000000" });
    req.session.otp.expires += 1;
    await register(req, response());
    const next = mocks.rate.mock.calls.map(([key]) => key).filter((key) => key.startsWith("rate:register:otp:"));
    expect(next[1]).not.toBe(otpKeys[0]);
  });

  it("rejects a wrong code and accepts the right one", async () => {
    const wrong = response();
    await register(request({ otp: "654321" }), wrong);
    expect(wrong.statusCode).toBe(400);
    expect(mocks.saveUser).not.toHaveBeenCalled();

    const req = request({ otp: "123456" });
    const ok = response();
    await register(req, ok);
    expect(ok.statusCode).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(expect.objectContaining({ email: issued.email }));
    expect(req.session.user).toMatchObject({ email: issued.email, isAdmin: false });
  });

  it("does not spend a code attempt on an invalid password", async () => {
    const res = response();
    await register(request({ otp: "123456", password: "short" }), res);
    expect(res.statusCode).toBe(400);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
});
