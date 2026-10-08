"use client";

import { Check, Lock, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { groupByDate } from "@/lib/conversations";
import type { Conversation } from "@/lib/types";

export interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  /** `null` = responsive default (open on desktop, closed drawer on mobile). */
  open: boolean | null;
  title: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  newChatButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

const rowButton =
  "inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-fg";

export default function Sidebar({
  conversations,
  activeId,
  open,
  title,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onClearAll,
  onClose,
  newChatButtonRef,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const groups = useMemo(() => groupByDate(conversations), [conversations]);

  const commitRename = () => {
    if (editingId) onRename(editingId, draft);
    setEditingId(null);
  };

  return (
    <>
      {open === true && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        id="chat-sidebar"
        aria-label="Conversations"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-surface-strong backdrop-blur-xl transition-[transform,visibility] duration-200 md:static md:z-auto",
          open === null && "max-md:invisible max-md:-translate-x-full",
          open === true && "visible translate-x-0",
          open === false && "invisible -translate-x-full md:hidden",
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            ref={newChatButtonRef}
            type="button"
            onClick={onNewChat}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            <span className="truncate">New chat</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] text-muted lg:inline">Ctrl K</kbd>
          </button>
          <button type="button" onClick={onClose} aria-label="Close sidebar" className={cn(rowButton, "md:hidden")}>
            <X className="size-4" />
          </button>
        </div>

        <nav aria-label={`${title} history`} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">Your conversations will appear here.</p>
          )}
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="mb-3">
              <h2 className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {group.label}
              </h2>
              <ul className="space-y-0.5">
                {group.conversations.map((conversation) => {
                  const isActive = conversation.id === activeId;
                  const isEditing = editingId === conversation.id;
                  const isConfirming = confirmingId === conversation.id;
                  return (
                    <li
                      key={conversation.id}
                      className={cn(
                        "group relative flex items-center rounded-lg",
                        isActive ? "bg-accent-soft" : "hover:bg-surface-hover",
                      )}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draft}
                          maxLength={80}
                          aria-label="Conversation title"
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          className="mx-1 my-1 w-full rounded-md border border-accent bg-transparent px-2 py-1 text-sm outline-none"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelect(conversation.id)}
                            aria-current={isActive ? "page" : undefined}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
                          >
                            <MessageSquare className="size-4 shrink-0 text-muted" aria-hidden />
                            <span className="truncate">{conversation.title}</span>
                          </button>
                          <div
                            className={cn(
                              "mr-1 flex items-center gap-0.5 transition-opacity",
                              isConfirming ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100",
                            )}
                          >
                            {isConfirming ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Confirm delete ${conversation.title}`}
                                  onClick={() => {
                                    onDelete(conversation.id);
                                    setConfirmingId(null);
                                  }}
                                  className={cn(rowButton, "text-danger")}
                                >
                                  <Check className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancel delete"
                                  onClick={() => setConfirmingId(null)}
                                  className={rowButton}
                                >
                                  <X className="size-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Rename ${conversation.title}`}
                                  onClick={() => {
                                    setDraft(conversation.title);
                                    setEditingId(conversation.id);
                                  }}
                                  className={rowButton}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${conversation.title}`}
                                  onClick={() => setConfirmingId(conversation.id)}
                                  className={rowButton}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="space-y-2 border-t border-line p-3 text-xs text-muted">
          <p className="flex items-start gap-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Chats are saved only in this browser. The server doesn&apos;t store them.</span>
          </p>
          {conversations.length > 0 &&
            (confirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-fg">Delete all chats?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmingClear(false);
                  }}
                  className="rounded-md border border-danger px-2 py-1 font-medium text-danger hover:bg-danger-soft"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="rounded-md border border-line px-2 py-1 hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                className="rounded-md px-1 py-0.5 underline underline-offset-2 hover:text-fg"
              >
                Clear all conversations
              </button>
            ))}
        </div>
      </aside>
    </>
  );
}
