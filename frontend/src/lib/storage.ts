/** localStorage / sessionStorage helpers that never throw (private mode, quota, SSR). */

type StorageKind = "local" | "session";

function getStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGet(key: string, kind: StorageKind = "local"): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string, kind: StorageKind = "local"): boolean {
  try {
    const storage = getStorage(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key: string, kind: StorageKind = "local"): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}
