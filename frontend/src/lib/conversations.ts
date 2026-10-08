/** Pure, immutable operations on the conversation store state (easy to unit test). */
import type { ChatMessage, Conversation, StoreState } from "./types";

export const MAX_CONVERSATIONS = 50;
export const MAX_MESSAGES = 200;
export const EMPTY_STATE: StoreState = Object.freeze({ version: 1, conversations: [], activeId: null }) as StoreState;

export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean;
}

export function createConversation(id: string, title: string, now: number): Conversation {
  return { id, title, createdAt: now, updatedAt: now, messages: [] };
}

export function addConversation(state: StoreState, conversation: Conversation): StoreState {
  const conversations = [conversation, ...state.conversations].slice(0, MAX_CONVERSATIONS);
  return { ...state, conversations, activeId: conversation.id };
}

export function setActive(state: StoreState, activeId: string | null): StoreState {
  return state.activeId === activeId ? state : { ...state, activeId };
}

function mapConversation(state: StoreState, id: string, fn: (c: Conversation) => Conversation): StoreState {
  let changed = false;
  const conversations = state.conversations.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  return changed ? { ...state, conversations } : state;
}

export function appendMessages(state: StoreState, id: string, messages: ChatMessage[], now: number): StoreState {
  return mapConversation(state, id, (c) => ({
    ...c,
    updatedAt: now,
    messages: [...c.messages, ...messages].slice(-MAX_MESSAGES),
  }));
}

/** Replace the message list (used by "regenerate" to drop the old answer). */
export function setMessages(state: StoreState, id: string, messages: ChatMessage[], now: number): StoreState {
  return mapConversation(state, id, (c) => ({ ...c, updatedAt: now, messages }));
}

/** Update one message; every other message keeps its identity (so memoised rows don't re-render). */
export function patchMessage(
  state: StoreState,
  conversationId: string,
  messageId: string,
  patch: (m: ChatMessage) => ChatMessage,
): StoreState {
  return mapConversation(state, conversationId, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.id === messageId ? patch(m) : m)),
  }));
}

export function renameConversation(state: StoreState, id: string, title: string): StoreState {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return state;
  return mapConversation(state, id, (c) => ({ ...c, title: clean }));
}

export function deleteConversation(state: StoreState, id: string): StoreState {
  const conversations = state.conversations.filter((c) => c.id !== id);
  const activeId = state.activeId === id ? null : state.activeId;
  return { ...state, conversations, activeId };
}

export function clearAll(): StoreState {
  return EMPTY_STATE;
}

export type GroupLabel = "Today" | "Yesterday" | "Previous 7 days" | "Older";
const GROUP_ORDER: GroupLabel[] = ["Today", "Yesterday", "Previous 7 days", "Older"];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupByDate(conversations: Conversation[], now: number = Date.now()) {
  const today = startOfDay(now);
  const day = 86_400_000;
  const buckets = new Map<GroupLabel, Conversation[]>();
  for (const conversation of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const start = startOfDay(conversation.updatedAt);
    const label: GroupLabel =
      start >= today ? "Today" : start >= today - day ? "Yesterday" : start >= today - 7 * day ? "Previous 7 days" : "Older";
    const list = buckets.get(label) ?? [];
    list.push(conversation);
    buckets.set(label, list);
  }
  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    conversations: buckets.get(label) ?? [],
  }));
}

/** Validate untrusted JSON from localStorage. Returns null if unusable. */
export function parseStoredState(raw: string | null): StoreState | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.conversations)) return null;

    const conversations: Conversation[] = [];
    for (const item of record.conversations) {
      if (typeof item !== "object" || item === null) continue;
      const c = item as Record<string, unknown>;
      if (typeof c.id !== "string" || typeof c.title !== "string" || !Array.isArray(c.messages)) continue;
      const messages: ChatMessage[] = [];
      for (const raw of c.messages) {
        if (typeof raw !== "object" || raw === null) continue;
        const m = raw as Record<string, unknown>;
        if (typeof m.id !== "string" || typeof m.content !== "string") continue;
        if (m.role !== "user" && m.role !== "assistant") continue;
        // A reload mid-stream leaves "streaming" behind: surface it as stopped.
        const status = m.status === "streaming" ? "stopped" : m.status;
        messages.push({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: typeof m.createdAt === "number" ? m.createdAt : 0,
          status: status === "error" || status === "stopped" ? status : "done",
          sources: Array.isArray(m.sources) ? (m.sources as ChatMessage["sources"]) : undefined,
          feedback: m.feedback === "up" || m.feedback === "down" ? m.feedback : null,
          error: typeof m.error === "string" ? m.error : undefined,
          latencyMs: typeof m.latencyMs === "number" ? m.latencyMs : undefined,
        });
      }
      conversations.push({
        id: c.id,
        title: c.title,
        createdAt: typeof c.createdAt === "number" ? c.createdAt : 0,
        updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : 0,
        messages,
      });
    }
    const activeId =
      typeof record.activeId === "string" && conversations.some((c) => c.id === record.activeId) ? record.activeId : null;
    return { version: 1, conversations, activeId };
  } catch {
    return null;
  }
}
