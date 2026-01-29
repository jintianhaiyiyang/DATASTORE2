import { useEffect, useState } from "react";
import { DEFAULT_SITE_SETTINGS } from "./siteDefaults";

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    let active = true;
    fetch("/api/site")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data || typeof data !== "object") return;
        setSettings({ ...DEFAULT_SITE_SETTINGS, ...data });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return settings;
}
