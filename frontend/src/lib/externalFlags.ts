/** Small useSyncExternalStore helpers (no setState-in-effect, SSR-safe). */
import { safeGet, safeSet } from "./storage";

const FLAG_EVENT = "medical-chat:flag-change";

/** A boolean persisted in sessionStorage (e.g. "disclaimer dismissed this session"). */
export function createSessionFlag(key: string) {
  return {
    subscribe(callback: () => void): () => void {
      window.addEventListener(FLAG_EVENT, callback);
      return () => window.removeEventListener(FLAG_EVENT, callback);
    },
    getSnapshot(): boolean {
      return safeGet(key, "session") === "1";
    },
    getServerSnapshot(): boolean {
      return false;
    },
    set(value: boolean): void {
      safeSet(key, value ? "1" : "0", "session");
      window.dispatchEvent(new Event(FLAG_EVENT));
    },
  };
}

export const onlineStore = {
  subscribe(callback: () => void): () => void {
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);
    return () => {
      window.removeEventListener("online", callback);
      window.removeEventListener("offline", callback);
    };
  },
  getSnapshot(): boolean {
    return navigator.onLine;
  },
  getServerSnapshot(): boolean {
    return true;
  },
};
