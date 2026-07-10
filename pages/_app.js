import App from "next/app";
import "../styles/globals.css";
import {
  SiteSettingsProvider,
  resolveClientSiteSettings,
} from "../lib/useSiteSettings";
import { DEFAULT_SITE_SETTINGS } from "../lib/siteDefaults";

function MyApp({ Component, pageProps, siteSettings }) {
  return (
    <SiteSettingsProvider initialSettings={siteSettings}>
      <Component {...pageProps} />
    </SiteSettingsProvider>
  );
}

/**
 * Load site branding on the server before HTML is sent.
 * This removes the flash of default "DATA STORE" title/logo.
 */
MyApp.getInitialProps = async (appContext) => {
  const appProps = await App.getInitialProps(appContext);
  let siteSettings = { ...DEFAULT_SITE_SETTINGS };

  if (typeof window === "undefined") {
    try {
      const { getSiteSettings } = await import("../lib/db");
      siteSettings = await getSiteSettings();
    } catch (error) {
      console.error("SSR site settings load failed:", error?.message || error);
    }
  } else {
    // Client-side route changes: reuse memory/localStorage (no waiting)
    siteSettings = resolveClientSiteSettings(DEFAULT_SITE_SETTINGS);
  }

  return { ...appProps, siteSettings };
};

export default MyApp;
