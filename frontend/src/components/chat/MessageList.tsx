"use client";

import { ArrowDown } from "lucide-react";
import { useEffect } from "react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { ChatMessage, Feedback } from "@/lib/types";
import MessageBubble from "./MessageBubble";

export interface MessageListProps {
  messages: ChatMessage[];
  onRegenerate: () => void;
  onFeedback: (messageId: string, value: Feedback) => void;
}

export default function MessageList({ messages, onRegenerate, onFeedback }: MessageListProps) {
  const { containerRef, contentRef, atBottom, scrollToBottom } = useAutoScroll();

  const last = messages[messages.length - 1];
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  // Sending a message always jumps to the bottom, even if the user had scrolled up.
  const lastUserId = last?.role === "user" ? last.id : undefined;
  useEffect(() => {
    if (lastUserId) scrollToBottom("auto");
  }, [lastUserId, scrollToBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} className="h-full overflow-y-auto overscroll-contain">
        <div
          ref={contentRef}
          role="log"
          aria-label="Conversation"
          aria-live="off"
          className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-6 sm:px-6"
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              canRegenerate={message.id === lastAssistantId}
              onRegenerate={onRegenerate}
              onFeedback={onFeedback}
            />
          ))}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface-strong px-3.5 py-1.5 text-xs font-medium text-fg shadow-[var(--shadow-glass)] backdrop-blur-md hover:bg-surface-hover"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          Jump to latest
        </button>
      )}
    </div>
  );
}
