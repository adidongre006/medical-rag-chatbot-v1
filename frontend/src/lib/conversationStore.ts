/**
 * Tiny external store (for useSyncExternalStore) that keeps conversations in
 * memory, persists them to localStorage (throttled) and stays in sync across
 * tabs via the `storage` event. Schema is versioned (`version: 1`).
 */
import { EMPTY_STATE, parseStoredState } from "./conversations";
import { safeGet, safeSet } from "./storage";
import type { StoreState } from "./types";

export const STORAGE_KEY = "medical-chat:conversations:v1";
const PERSIST_DELAY_MS = 400;

let state: StoreState = EMPTY_STATE;
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = parseStoredState(safeGet(STORAGE_KEY)) ?? EMPTY_STATE;
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function persistNow(): void {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  safeSet(STORAGE_KEY, JSON.stringify(state));
}

function onStorage(event: StorageEvent): void {
  // Another tab wrote: adopt its state instead of clobbering it later.
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  state = parseStoredState(event.newValue) ?? EMPTY_STATE;
  emit();
}

function onPageHide(): void {
  if (persistTimer !== undefined) persistNow();
}

export const conversationStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (!listening && typeof window !== "undefined") {
      listening = true;
      window.addEventListener("storage", onStorage);
      window.addEventListener("pagehide", onPageHide);
    }
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): StoreState {
    ensureLoaded();
    return state;
  },
  getServerSnapshot(): StoreState {
    return EMPTY_STATE;
  },
  update(fn: (current: StoreState) => StoreState): void {
    ensureLoaded();
    const next = fn(state);
    if (next === state) return;
    state = next;
    emit();
    if (persistTimer === undefined) persistTimer = setTimeout(persistNow, PERSIST_DELAY_MS);
  },
  /** Persist immediately (call when a stream finishes). */
  flush(): void {
    ensureLoaded();
    persistNow();
  },
  /** Test helper. */
  reset(next: StoreState = EMPTY_STATE): void {
    state = next;
    loaded = true;
    emit();
  },
};
