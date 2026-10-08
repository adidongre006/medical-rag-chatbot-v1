"use client";

import { useEffect, useRef } from "react";

export interface Hotkey {
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  /** Require Ctrl (Windows/Linux) or Cmd (macOS). */
  mod?: boolean;
  /** Fire even while typing in an input/textarea (default false). */
  allowInInput?: boolean;
  handler: (event: KeyboardEvent) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function useHotkeys(hotkeys: Hotkey[]): void {
  const ref = useRef(hotkeys);
  useEffect(() => {
    ref.current = hotkeys;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      for (const hotkey of ref.current) {
        if (event.key.toLowerCase() !== hotkey.key.toLowerCase()) continue;
        const modPressed = event.ctrlKey || event.metaKey;
        if (Boolean(hotkey.mod) !== modPressed) continue;
        if (!hotkey.mod && (event.altKey || event.ctrlKey || event.metaKey)) continue;
        if (!hotkey.allowInInput && isTypingTarget(event.target)) continue;
        hotkey.handler(event);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
