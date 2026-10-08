"use client";

/**
 * MedicalChat — a ChatGPT-style chat experience for the Medical RAG API.
 *
 * Composes the sidebar (conversation history), message thread (streamed
 * Markdown answers with citations) and composer. All state lives in `useChat`
 * (streaming lifecycle + localStorage persistence); this component only wires
 * layout, shortcuts and accessibility together.
 *
 *   <MedicalChat apiBaseUrl="https://api.example.com" />
 *
 * `apiBaseUrl` defaults to NEXT_PUBLIC_API_BASE_URL, then http://localhost:8000.
 * Educational use only — not medical advice.
 */

import { MotionConfig, motion } from "framer-motion";
import { Stethoscope, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useChat } from "@/hooks/useChat";
import { useHotkeys } from "@/hooks/useHotkeys";
import { DEFAULT_API_BASE_URL } from "@/lib/api";
import { createSessionFlag, onlineStore } from "@/lib/externalFlags";
import ChatHeader from "./ChatHeader";
import Composer from "./Composer";
import DisclaimerBanner from "./DisclaimerBanner";
import MessageList from "./MessageList";
import ShortcutsDialog from "./ShortcutsDialog";
import Sidebar from "./Sidebar";
import SuggestedPrompts from "./SuggestedPrompts";

export interface MedicalChatProps {
  /** Base URL of the FastAPI backend. */
  apiBaseUrl?: string;
  title?: string;
  subtitle?: string;
  /** Clickable starter questions shown on an empty conversation. */
  suggestedPrompts?: string[];
}

const DEFAULT_PROMPTS = [
  "What are the common symptoms of diabetes?",
  "How is high blood pressure treated?",
  "What causes migraines, and what helps them?",
  "Explain the stages of wound healing.",
];

const disclaimerFlag = createSessionFlag("medical-chat:disclaimer-dismissed");
const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

export default function MedicalChat({
  apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  title = "Medical Chatbot",
  subtitle = "Ask me anything!",
  suggestedPrompts = DEFAULT_PROMPTS,
}: MedicalChatProps) {
  const chat = useChat({ apiBaseUrl });
  const { send, stop, newChat, selectConversation, isStreaming } = chat;

  // null = responsive default: open on desktop, closed drawer on mobile.
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const newChatRef = useRef<HTMLButtonElement>(null);

  const online = useSyncExternalStore(onlineStore.subscribe, onlineStore.getSnapshot, onlineStore.getServerSnapshot);
  const disclaimerDismissed = useSyncExternalStore(
    disclaimerFlag.subscribe,
    disclaimerFlag.getSnapshot,
    disclaimerFlag.getServerSnapshot,
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => (current === null ? !isDesktop() : !current));
  }, []);
  const closeSidebarOnMobile = useCallback(() => {
    if (!isDesktop()) setSidebarOpen(null);
  }, []);
  const focusComposer = useCallback(() => textareaRef.current?.focus(), []);

  const handleNewChat = useCallback(() => {
    newChat();
    closeSidebarOnMobile();
    focusComposer();
  }, [newChat, closeSidebarOnMobile, focusComposer]);

  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      closeSidebarOnMobile();
    },
    [selectConversation, closeSidebarOnMobile],
  );

  const handleSend = useCallback(
    (text: string) => {
      void send(text);
    },
    [send],
  );

  // Move focus into the drawer when it opens on mobile.
  useEffect(() => {
    if (sidebarOpen === true && !isDesktop()) newChatRef.current?.focus();
  }, [sidebarOpen]);

  useHotkeys([
    {
      key: "k",
      mod: true,
      allowInInput: true,
      handler: (event) => {
        event.preventDefault();
        handleNewChat();
      },
    },
    {
      key: "b",
      mod: true,
      allowInInput: true,
      handler: (event) => {
        event.preventDefault();
        toggleSidebar();
      },
    },
    {
      key: "Escape",
      allowInInput: true,
      handler: () => {
        if (isStreaming) stop();
        else if (sidebarOpen === true) closeSidebarOnMobile();
      },
    },
    {
      key: "/",
      handler: (event) => {
        event.preventDefault();
        focusComposer();
      },
    },
    { key: "?", handler: () => setShortcutsOpen(true) },
  ]);

  const hasMessages = chat.messages.length > 0;
  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");
  // Streamed tokens are NOT announced one by one; screen readers get start/finish status instead.
  const announcement = isStreaming
    ? "Assistant is responding…"
    : lastAssistant?.status === "done"
      ? "Response complete."
      : "";

  return (
    <MotionConfig reducedMotion="user">
      <a
        href="#message-input"
        className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to message box
      </a>

      <div className="flex h-dvh w-full overflow-hidden">
        <Sidebar
          conversations={chat.conversations}
          activeId={chat.activeId}
          open={sidebarOpen}
          title={title}
          onNewChat={handleNewChat}
          onSelect={handleSelect}
          onRename={chat.rename}
          onDelete={chat.remove}
          onClearAll={chat.clearAll}
          onClose={() => setSidebarOpen(isDesktop() ? false : null)}
          newChatButtonRef={newChatRef}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ChatHeader
            title={title}
            subtitle={subtitle}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onShowShortcuts={() => setShortcutsOpen(true)}
            onShowDisclaimer={() => disclaimerFlag.set(false)}
          />

          {!online && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 bg-danger-soft px-4 py-1.5 text-sm text-danger"
            >
              <WifiOff className="size-4" aria-hidden />
              You&apos;re offline. Messages will fail until your connection returns.
            </div>
          )}
          {!disclaimerDismissed && <DisclaimerBanner onDismiss={() => disclaimerFlag.set(true)} />}

          <main className="flex min-h-0 flex-1 flex-col">
            {hasMessages ? (
              <MessageList messages={chat.messages} onRegenerate={chat.regenerate} onFeedback={chat.setFeedback} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="flex flex-col items-center gap-3 text-center"
                >
                  <div className="relative">
                    <div className="flex size-16 items-center justify-center rounded-full border-[1.5px] border-line bg-accent text-accent-fg shadow-[var(--shadow-glass)]">
                      <Stethoscope className="size-8" aria-hidden />
                    </div>
                    <span className="absolute right-0.5 bottom-0.5 size-3.5 rounded-full border-2 border-white bg-online" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">How can I help with your health questions?</h2>
                  <p className="max-w-md text-sm text-muted">
                    I answer from an indexed medical reference and show my sources. I can&apos;t diagnose or replace a
                    healthcare professional.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
                  className="flex w-full justify-center"
                >
                  <SuggestedPrompts prompts={suggestedPrompts} onPick={handleSend} />
                </motion.div>
              </div>
            )}

            <Composer onSend={handleSend} onStop={stop} isStreaming={isStreaming} textareaRef={textareaRef} />
          </main>
        </div>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </MotionConfig>
  );
}
