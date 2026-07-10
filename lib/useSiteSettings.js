import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";

const STORAGE_KEY = "datastore_site_settings_v1";
const UPDATE_EVENT = "site-settings-updated";

const SiteSettingsContext = createContext({
  ...DEFAULT_SITE_SETTINGS,
  ready: false,
});

/** @type {Record<string, any> | null} */
let moduleCache = null;

export function mergeSettings(next) {
  return { ...DEFAULT_SITE_SETTINGS, ...(next || {}) };
}

export function getModuleCache() {
  return moduleCache;
}

export function readLocalSiteSettings() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return mergeSettings(parsed);
  } catch {
    return null;
  }
}

export function writeLocalSiteSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota exceeded (e.g. huge base64 logo) — still keep in-memory cache
  }
}

/**
 * Update in-memory + localStorage cache and notify all providers (e.g. after admin save).
 */
export function updateSiteSettingsCache(next) {
  const merged = mergeSettings(next);
  moduleCache = merged;
  writeLocalSiteSettings(merged);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UPDATE_EVENT, { detail: merged })
    );
  }
  return merged;
}

/**
 * Resolve the best available settings for App.getInitialProps (client navigations).
 */
export function resolveClientSiteSettings(fallback = DEFAULT_SITE_SETTINGS) {
  return moduleCache || readLocalSiteSettings() || mergeSettings(fallback);
}

export function SiteSettingsProvider({ initialSettings, children }) {
  // Prefer SSR payload so first paint matches server HTML (no brand flash).
  const [settings, setSettings] = useState(() => {
    const seed = mergeSettings(initialSettings || moduleCache || DEFAULT_SITE_SETTINGS);
    moduleCache = seed;
    return seed;
  });
  const [ready, setReady] = useState(() => !!initialSettings || !!moduleCache);

  const apply = useCallback((next) => {
    const merged = mergeSettings(next);
    moduleCache = merged;
    writeLocalSiteSettings(merged);
    setSettings(merged);
    setReady(true);
  }, []);

  // Keep in sync if App re-renders with new SSR props (rare but safe)
  useEffect(() => {
    if (initialSettings && typeof initialSettings === "object") {
      apply(initialSettings);
    }
  }, [initialSettings, apply]);

  useEffect(() => {
    // Soft revalidate in background — corrects stale local/SSR cache
    let cancelled = false;
    fetch("/api/site", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;
        apply(data);
      })
      .catch(() => {
        // Keep whatever we already have (SSR / localStorage)
        if (!cancelled) setReady(true);
      });

    const onUpdate = (event) => {
      if (event?.detail && typeof event.detail === "object") {
        apply(event.detail);
      }
    };
    window.addEventListener(UPDATE_EVENT, onUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(UPDATE_EVENT, onUpdate);
    };
  }, [apply]);

  const value = { ...settings, ready };

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
