import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  addConversation,
  appendMessages,
  createConversation,
  deleteConversation,
  deriveTitle,
  groupByDate,
  parseStoredState,
  patchMessage,
  renameConversation,
} from "@/lib/conversations";
import { formatTime } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";

const msg = (id: string, role: ChatMessage["role"] = "user"): ChatMessage => ({
  id,
  role,
  content: id,
  createdAt: 0,
  status: "done",
});

describe("conversation helpers", () => {
  it("derives a trimmed single-line title", () => {
    expect(deriveTitle("  What   is\n diabetes? ")).toBe("What is diabetes?");
    expect(deriveTitle("")).toBe("New chat");
    expect(deriveTitle("x".repeat(100))).toHaveLength(48);
  });

  it("patchMessage only replaces the targeted message (others keep identity)", () => {
    let state = addConversation(EMPTY_STATE, createConversation("c1", "t", 1));
    state = appendMessages(state, "c1", [msg("a"), msg("b", "assistant")], 2);
    const before = state.conversations[0]!.messages;
    const next = patchMessage(state, "c1", "b", (m) => ({ ...m, content: "changed" }));
    const after = next.conversations[0]!.messages;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]?.content).toBe("changed");
  });

  it("renames (sanitised) and deletes, clearing the active id", () => {
    let state = addConversation(EMPTY_STATE, createConversation("c1", "old", 1));
    state = renameConversation(state, "c1", "  new   title ");
    expect(state.conversations[0]?.title).toBe("new title");
    expect(renameConversation(state, "c1", "   ")).toBe(state);
    state = deleteConversation(state, "c1");
    expect(state.conversations).toHaveLength(0);
    expect(state.activeId).toBeNull();
  });

  it("groups by Today / Yesterday / Previous 7 days / Older", () => {
    const now = new Date(2026, 9, 5, 12).getTime();
    const day = 86_400_000;
    const mk = (id: string, updatedAt: number) => ({ ...createConversation(id, id, updatedAt), updatedAt });
    const groups = groupByDate([mk("old", now - 30 * day), mk("today", now), mk("yday", now - day), mk("week", now - 4 * day)], now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Previous 7 days", "Older"]);
  });

  it("formats time zero-padded as HH:mm", () => {
    expect(formatTime(new Date(2026, 9, 5, 9, 5).getTime())).toBe("09:05");
  });
});

describe("parseStoredState", () => {
  it("rejects garbage and wrong versions", () => {
    expect(parseStoredState(null)).toBeNull();
    expect(parseStoredState("{")).toBeNull();
    expect(parseStoredState(JSON.stringify({ version: 2, conversations: [] }))).toBeNull();
  });

  it("turns a stale 'streaming' message into 'stopped' and drops invalid entries", () => {
    const raw = JSON.stringify({
      version: 1,
      activeId: "c1",
      conversations: [
        {
          id: "c1",
          title: "t",
          createdAt: 1,
          updatedAt: 2,
          messages: [{ id: "m1", role: "assistant", content: "par", status: "streaming" }, { nope: true }],
        },
        "junk",
      ],
    });
    const state = parseStoredState(raw);
    expect(state?.activeId).toBe("c1");
    expect(state?.conversations).toHaveLength(1);
    expect(state?.conversations[0]?.messages).toHaveLength(1);
    expect(state?.conversations[0]?.messages[0]?.status).toBe("stopped");
  });
});
