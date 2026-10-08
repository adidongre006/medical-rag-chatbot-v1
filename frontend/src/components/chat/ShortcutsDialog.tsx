"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Enter"], label: "Send message" },
  { keys: ["Shift", "Enter"], label: "New line" },
  { keys: ["Ctrl/⌘", "K"], label: "New chat" },
  { keys: ["Ctrl/⌘", "B"], label: "Toggle sidebar" },
  { keys: ["Esc"], label: "Stop generating" },
  { keys: ["/"], label: "Focus the message box" },
  { keys: ["?"], label: "Show this help" },
];

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // click on the backdrop
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-surface-strong p-0 text-fg shadow-[var(--shadow-glass)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-base font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>
        <dl className="mt-4 space-y-2.5 text-sm">
          {SHORTCUTS.map(({ keys, label }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="flex gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-fg"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
