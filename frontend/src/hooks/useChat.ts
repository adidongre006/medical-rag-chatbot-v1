"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, streamChat } from "@/lib/api";
import {
  addConversation,
  appendMessages,
  clearAll,
  createConversation,
  deleteConversation,
  deriveTitle,
  patchMessage,
  renameConversation,
  setActive,
  setMessages,
} from "@/lib/conversations";
import { conversationStore } from "@/lib/conversationStore";
import { newId } from "@/lib/format";
import type { ChatMessage, Feedback, HistoryTurn, StreamEvent } from "@/lib/types";
import { useLocalConversations } from "./useLocalConversations";

const MAX_HISTORY_TURNS = 10;
const EMPTY_MESSAGES: ChatMessage[] = [];

function toHistory(messages: ChatMessage[]): HistoryTurn[] {
  return messages
    .filter((m) => (m.status === "done" || m.status === "stopped") && m.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

function findMessage(conversationId: string, messageId: string): ChatMessage | undefined {
  return conversationStore
    .getSnapshot()
    .conversations.find((c) => c.id === conversationId)
    ?.messages.find((m) => m.id === messageId);
}

export interface UseChatOptions {
  apiBaseUrl: string;
}

/** Owns conversation state, streaming lifecycle (send / stop / regenerate) and persistence. */
export function useChat({ apiBaseUrl }: UseChatOptions) {
  const state = useLocalConversations();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  const active = state.conversations.find((c) => c.id === state.activeId) ?? null;
  const messages = active?.messages ?? EMPTY_MESSAGES;

  // Abort any in-flight request when the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runAssistantTurn = useCallback(
    async (conversationId: string, userText: string, history: HistoryTurn[]) => {
      const assistantId = newId("m");
      const startedAt = Date.now();
      conversationStore.update((s) =>
        appendMessages(
          s,
          conversationId,
          [{ id: assistantId, role: "assistant", content: "", createdAt: startedAt, status: "streaming", feedback: null }],
          startedAt,
        ),
      );

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setIsStreaming(true);

      // Tokens are batched per animation frame so long answers don't re-render per token.
      let pending = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!pending) return;
        const chunk = pending;
        pending = "";
        conversationStore.update((s) =>
          patchMessage(s, conversationId, assistantId, (m) => ({ ...m, content: m.content + chunk })),
        );
      };
      const flushNow = () => {
        if (frame) cancelAnimationFrame(frame);
        flush();
      };
      const finish = (patch: Partial<ChatMessage>) => {
        flushNow();
        conversationStore.update((s) => patchMessage(s, conversationId, assistantId, (m) => ({ ...m, ...patch })));
      };

      let failed = false;
      const onEvent = (event: StreamEvent) => {
        switch (event.type) {
          case "sources":
            conversationStore.update((s) =>
              patchMessage(s, conversationId, assistantId, (m) => ({ ...m, sources: event.sources })),
            );
            break;
          case "token":
            pending += event.text;
            if (!frame) frame = requestAnimationFrame(flush);
            break;
          case "done":
            finish({ status: "done", latencyMs: event.latencyMs });
            break;
          case "error":
            failed = true;
            finish({ status: "error", error: event.message });
            break;
        }
      };

      try {
        await streamChat({
          baseUrl: apiBaseUrl,
          body: { message: userText, conversation_id: conversationId.slice(0, 64), history },
          signal: controller.signal,
          onEvent,
        });
        // Stream ended without a terminal event (e.g. a proxy cut it): settle the message.
        flushNow();
        const message = findMessage(conversationId, assistantId);
        if (message && (message.status === "streaming" || message.status === "done") && !message.content.trim()) {
          finish({ status: "error", error: "The assistant returned an empty response." });
        } else if (message?.status === "streaming") {
          finish({ status: "done" });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          finish({ status: "stopped" });
        } else if (!failed) {
          const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
          finish({ status: "error", error: message });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
        setIsStreaming(false);
        conversationStore.flush();
      }
    },
    [apiBaseUrl],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streamingRef.current) return;

      const now = Date.now();
      const snapshot = conversationStore.getSnapshot();
      const existing = snapshot.conversations.find((c) => c.id === snapshot.activeId);
      let conversationId: string;
      if (existing) {
        conversationId = existing.id;
      } else {
        conversationId = newId("c");
        const created = createConversation(conversationId, deriveTitle(trimmed), now);
        conversationStore.update((s) => addConversation(s, created));
      }

      const history = toHistory(existing?.messages ?? []);
      const userMessage: ChatMessage = { id: newId("m"), role: "user", content: trimmed, createdAt: now, status: "done" };
      const id = conversationId;
      conversationStore.update((s) => appendMessages(s, id, [userMessage], now));
      await runAssistantTurn(conversationId, trimmed, history);
    },
    [runAssistantTurn],
  );

  /** Re-run the last assistant turn (also used by "Retry" after an error). */
  const regenerate = useCallback(async () => {
    if (streamingRef.current) return;
    const snapshot = conversationStore.getSnapshot();
    const conversation = snapshot.conversations.find((c) => c.id === snapshot.activeId);
    if (!conversation) return;
    const list = conversation.messages;
    let userIndex = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.role === "user") {
        userIndex = i;
        break;
      }
    }
    const userMessage = list[userIndex];
    if (!userMessage) return;
    const kept = list.slice(0, userIndex + 1);
    conversationStore.update((s) => setMessages(s, conversation.id, kept, Date.now()));
    await runAssistantTurn(conversation.id, userMessage.content, toHistory(list.slice(0, userIndex)));
  }, [runAssistantTurn]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    conversationStore.update((s) => setActive(s, null));
  }, []);

  const selectConversation = useCallback((id: string) => {
    abortRef.current?.abort();
    conversationStore.update((s) => setActive(s, id));
  }, []);

  const rename = useCallback((id: string, title: string) => {
    conversationStore.update((s) => renameConversation(s, id, title));
    conversationStore.flush();
  }, []);

  const remove = useCallback((id: string) => {
    if (conversationStore.getSnapshot().activeId === id) abortRef.current?.abort();
    conversationStore.update((s) => deleteConversation(s, id));
    conversationStore.flush();
  }, []);

  const clearAllConversations = useCallback(() => {
    abortRef.current?.abort();
    conversationStore.update(() => clearAll());
    conversationStore.flush();
  }, []);

  const setFeedback = useCallback((messageId: string, value: Feedback) => {
    const snapshot = conversationStore.getSnapshot();
    const conversation = snapshot.conversations.find((c) => c.id === snapshot.activeId);
    if (!conversation) return;
    // Clicking the same thumb again clears it. (Local only — wire to an API here later.)
    conversationStore.update((s) =>
      patchMessage(s, conversation.id, messageId, (m) => ({ ...m, feedback: m.feedback === value ? null : value })),
    );
    conversationStore.flush();
  }, []);

  return {
    conversations: state.conversations,
    activeId: state.activeId,
    messages,
    isStreaming,
    send,
    stop,
    regenerate,
    newChat,
    selectConversation,
    rename,
    remove,
    clearAll: clearAllConversations,
    setFeedback,
  };
}
