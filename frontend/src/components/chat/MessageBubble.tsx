"use client";

import { Check, Copy, RefreshCw, Stethoscope, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { detectEmergency } from "@/lib/safety";
import type { ChatMessage, Feedback } from "@/lib/types";
import EmergencyNotice from "./EmergencyNotice";
import SourcesPanel from "./SourcesPanel";
import TypingIndicator from "./TypingIndicator";

// Markdown (react-markdown + remark/rehype) is code-split out of the initial bundle.
const Markdown = dynamic(() => import("./Markdown"), {
  loading: () => <p className="whitespace-pre-wrap" />,
});

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Only the latest assistant message can be regenerated. */
  canRegenerate: boolean;
  onRegenerate: () => void;
  onFeedback: (messageId: string, value: Feedback) => void;
}

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-fg",
        pressed && "text-accent",
      )}
    >
      {children}
    </button>
  );
}

function MessageBubbleImpl({ message, canRegenerate, onRegenerate, onFeedback }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context / denied): nothing to do */
    }
  }, [message.content]);

  if (message.role === "user") {
    const emergency = detectEmergency(message.content);
    return (
      <div className="flex justify-end" data-testid="message-user">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="rounded-bubble rounded-br-md bg-user px-4 py-2.5 text-user-fg shadow-sm">
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
          </div>
          <time className="px-1 text-[11px] text-muted" dateTime={new Date(message.createdAt).toISOString()}>
            {formatTime(message.createdAt)}
          </time>
          {emergency && <EmergencyNotice kind={emergency} />}
        </div>
      </div>
    );
  }

  const streaming = message.status === "streaming";
  const showTyping = streaming && message.content.length === 0;

  return (
    <div className="flex gap-3" data-testid="message-assistant" aria-busy={streaming}>
      <div
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm"
        aria-hidden
      >
        <Stethoscope className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        {showTyping ? (
          <TypingIndicator />
        ) : (
          <div className={cn(streaming && "caret")}>
            <Markdown>{message.content}</Markdown>
          </div>
        )}

        {message.status === "stopped" && (
          <p className="mt-2 text-xs text-muted italic">
            {message.content ? "Generation stopped." : "You stopped this response."}
          </p>
        )}

        {message.status === "error" && (
          <div
            role="alert"
            className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{message.error ?? "Something went wrong."}</span>
            {canRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="rounded-lg border border-current px-2.5 py-1 text-xs font-medium hover:bg-surface-hover"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {message.sources && message.sources.length > 0 && <SourcesPanel sources={message.sources} />}

        {!streaming && message.status !== "error" && (
          <div className="mt-1.5 -ml-2 flex items-center gap-0.5">
            <IconButton label={copied ? "Copied" : "Copy answer"} onClick={copy}>
              {copied ? <Check className="size-4 text-online" /> : <Copy className="size-4" />}
            </IconButton>
            {canRegenerate && (
              <IconButton label="Regenerate answer" onClick={onRegenerate}>
                <RefreshCw className="size-4" />
              </IconButton>
            )}
            <IconButton
              label="Good answer"
              pressed={message.feedback === "up"}
              onClick={() => onFeedback(message.id, "up")}
            >
              <ThumbsUp className="size-4" />
            </IconButton>
            <IconButton
              label="Bad answer"
              pressed={message.feedback === "down"}
              onClick={() => onFeedback(message.id, "down")}
            >
              <ThumbsDown className="size-4" />
            </IconButton>
            <time className="tabular ml-2 text-[11px] text-muted" dateTime={new Date(message.createdAt).toISOString()}>
              {formatTime(message.createdAt)}
            </time>
          </div>
        )}
      </div>
    </div>
  );
}

/** Memoised: while one answer streams, earlier messages keep their identity and skip re-rendering. */
const MessageBubble = memo(MessageBubbleImpl);
export default MessageBubble;
