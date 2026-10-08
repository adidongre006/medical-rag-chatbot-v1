"use client";

import { Keyboard, PanelLeft, ShieldAlert, Stethoscope } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const headerButton =
  "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-fg";

export interface ChatHeaderProps {
  title: string;
  subtitle: string;
  sidebarOpen: boolean | null;
  onToggleSidebar: () => void;
  onShowShortcuts: () => void;
  onShowDisclaimer: () => void;
}

export default function ChatHeader({
  title,
  subtitle,
  sidebarOpen,
  onToggleSidebar,
  onShowShortcuts,
  onShowDisclaimer,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 backdrop-blur-md sm:px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        aria-controls="chat-sidebar"
        aria-expanded={sidebarOpen ?? undefined}
        title="Toggle sidebar (Ctrl/⌘ B)"
        className={headerButton}
      >
        <PanelLeft className="size-[18px]" />
      </button>

      {/* Avatar + presence dot: carried over from the original card header. */}
      <div className="relative shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-line bg-accent text-accent-fg">
          <Stethoscope className="size-5" aria-hidden />
        </div>
        <span
          className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-white bg-online"
          role="img"
          aria-label="Online"
        />
      </div>

      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onShowDisclaimer}
          aria-label="Show medical disclaimer"
          title="Medical disclaimer"
          className={headerButton}
        >
          <ShieldAlert className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className={`${headerButton} max-sm:hidden`}
        >
          <Keyboard className="size-[18px]" />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
