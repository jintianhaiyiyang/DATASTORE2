/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  agentRules: false,
  poweredByHeader: false,
  // Pages Router dependencies are external by default. Bundle this CJS/ESM
  // pair so Vercel does not try to require htmlparser2's ESM entry at runtime.
  transpilePackages: ["sanitize-html", "htmlparser2"],
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    const scriptPolicy = isProduction
      ? "script-src 'self' 'unsafe-inline' https://res.wx.qq.com"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://res.wx.qq.com";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; connect-src 'self'; frame-src https://*.qq.com https://*.weixin.qq.com${isProduction ? "; upgrade-insecure-requests" : ""}`,
      },
    ];
    if (isProduction) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
