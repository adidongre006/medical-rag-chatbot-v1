"use client";

import { ArrowUp, Square } from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/cn";

export const MAX_MESSAGE_LENGTH = 2000;
const MAX_ROWS = 8;

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
}

export default function Composer({ onSend, onStop, isStreaming, textareaRef, placeholder }: ComposerProps) {
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-grow up to MAX_ROWS lines, then scroll inside the textarea.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const max = lineHeight * MAX_ROWS + padding;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, textareaRef]);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !isStreaming;

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
    setNotice(null);
  }, [canSend, onSend, trimmed]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline; ignore Enter while an IME is composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text");
    const el = event.currentTarget;
    const projected = value.length - (el.selectionEnd - el.selectionStart) + pasted.length;
    setNotice(projected > MAX_MESSAGE_LENGTH ? `Pasted text was trimmed to ${MAX_MESSAGE_LENGTH} characters.` : null);
  };

  const nearLimit = value.length >= MAX_MESSAGE_LENGTH * 0.8;

  return (
    <div className="px-4 pt-2 pb-3 sm:px-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl"
      >
        <div className="flex items-end gap-2 rounded-4xl border-2  border-line bg-surface-strong p-2 pl-4 shadow-(--shadow-glass) backdrop-blur-md focus-within:border-accent">
          <label htmlFor="message-input" className="sr-only">
            Message
          </label>
          <textarea
            id="message-input"
            ref={textareaRef}
            value={value}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={placeholder ?? "Ask a medical question…"}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="max-h-none rounded-3xl outline-0  min-h-6 flex-1  resize-none self-center bg-transparent py-1.5 leading-6 text-fg  placeholder:text-muted"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating (Esc)"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fg"
              style={{ color: "var(--bg-from)" }}
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              title="Send (Enter)"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity",
                !canSend && "cursor-not-allowed opacity-40",
              )}
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-3 text-[11px] text-muted">
          <p>
            {notice ?? "Educational use only — not medical advice. Enter to send, Shift+Enter for a new line."}
          </p>
          {nearLimit && (
            <span
              className={cn("tabular shrink-0", value.length >= MAX_MESSAGE_LENGTH && "font-semibold text-danger")}
              aria-live="polite"
            >
              {value.length}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
