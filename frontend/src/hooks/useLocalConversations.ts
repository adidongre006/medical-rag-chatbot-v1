"use client";

import { useSyncExternalStore } from "react";
import { conversationStore } from "@/lib/conversationStore";
import type { StoreState } from "@/lib/types";

/** Reactive, persisted conversation state (SSR-safe: server snapshot is empty). */
export function useLocalConversations(): StoreState {
  return useSyncExternalStore(
    conversationStore.subscribe,
    conversationStore.getSnapshot,
    conversationStore.getServerSnapshot,
  );
}
