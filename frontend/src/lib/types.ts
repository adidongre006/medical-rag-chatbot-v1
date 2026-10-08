export interface Source {
  source: string;
  page: number | null;
  snippet: string;
}

export type MessageStatus = "streaming" | "done" | "error" | "stopped";
export type Feedback = "up" | "down";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: MessageStatus;
  sources?: Source[];
  feedback?: Feedback | null;
  error?: string;
  latencyMs?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface StoreState {
  version: 1;
  conversations: Conversation[];
  activeId: string | null;
}

/** Wire format sent to POST /api/v1/chat/stream. */
export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestBody {
  message: string;
  conversation_id?: string;
  history: HistoryTurn[];
}

/** Typed union of Server-Sent Events emitted by the backend. */
export type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "done"; conversationId: string; latencyMs: number }
  | { type: "error"; code: string; message: string };
