"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 80;

/**
 * Sticky-bottom scrolling for a chat log.
 * - follows new content only while the user is already at the bottom
 * - exposes `atBottom` so the UI can show a "Jump to latest" pill otherwise
 */
export function useAutoScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior }); // the scroll event updates `atBottom`
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      const near = distance <= THRESHOLD_PX;
      stickRef.current = near;
      setAtBottom(near);
    };
    container.addEventListener("scroll", onScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      if (stickRef.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);

    return () => {
      container.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return { containerRef, contentRef, atBottom, scrollToBottom };
}
