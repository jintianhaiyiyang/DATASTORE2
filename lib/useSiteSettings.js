import { useEffect, useState } from "react";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";

let cachedSettings = { ...DEFAULT_SITE_SETTINGS };
let hasLoaded = false;
let inFlight = null;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener(cachedSettings));
}

function setCache(next) {
  cachedSettings = { ...DEFAULT_SITE_SETTINGS, ...(next || {}) };
  notifyListeners();
}

async function loadSettings() {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/site", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && typeof data === "object") {
        setCache(data);
      }
      hasLoaded = true;
      return cachedSettings;
    })
    .catch(() => {
      hasLoaded = true;
      return cachedSettings;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function updateSiteSettingsCache(next) {
  setCache(next);
}

export function useSiteSettings() {
  const [settings, setSettings] = useState(cachedSettings);

  useEffect(() => {
    listeners.add(setSettings);
    setSettings(cachedSettings);
    if (!hasLoaded) {
      loadSettings();
    }
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  return settings;
}
