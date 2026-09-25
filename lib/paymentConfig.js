// Environment checks only: never import payment SDKs or expose secrets here.
const REQUIRED_ENV = {
  wechat: ["WX_APP_ID", "WX_MCH_ID", "WX_API_V3_KEY", "WX_CERT", "WX_KEY"],
  alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY"],
};

export const PAYMENT_PROVIDERS = Object.keys(REQUIRED_ENV);

export function isProviderConfigured(provider, env = process.env) {
  return (REQUIRED_ENV[provider] || [null]).every((key) => !!key && !!env[key]);
}

export function paymentConfigured(env = process.env) {
  return { wechat: isProviderConfigured("wechat", env), alipay: isProviderConfigured("alipay", env) };
}

// The admin switch is the business decision; configuration decides whether
// the method can work at all. The storefront shows a method only when both hold.
export function isProviderEnabled(settings, provider) {
  if (provider === "wechat") return settings?.enableWechatPay !== false;
  if (provider === "alipay") return settings?.enableAlipay !== false;
  return false;
}

export function withPaymentAvailability(settings, env = process.env) {
  const configured = paymentConfigured(env);
  return {
    ...settings,
    payments: {
      wechat: isProviderEnabled(settings, "wechat") && configured.wechat,
      alipay: isProviderEnabled(settings, "alipay") && configured.alipay,
    },
  };
}
