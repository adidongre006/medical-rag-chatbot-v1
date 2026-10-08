import { safeGet, safeSet } from "./storage";

export type Theme = "light" | "dark";
export const THEME_KEY = "medical-chat:theme";
const EVENT = "medical-chat:theme-change";

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function getServerTheme(): Theme {
  return "dark";
}

export function setTheme(theme: Theme): void {
  safeSet(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribe to manual toggles and (when no manual choice exists) OS theme changes. */
export function subscribeTheme(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const onSystemChange = () => {
    const stored = safeGet(THEME_KEY);
    if (stored === "light" || stored === "dark") return;
    document.documentElement.dataset.theme = media.matches ? "light" : "dark";
    callback();
  };
  window.addEventListener(EVENT, callback);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(EVENT, callback);
    media.removeEventListener("change", onSystemChange);
  };
}
