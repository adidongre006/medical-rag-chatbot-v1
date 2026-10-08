import type { ChatRequestBody, Source, StreamEvent } from "./types";

export const DEFAULT_API_BASE_URL = "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Split a buffer of SSE text into complete frames plus the unfinished tail.
 * Handles \r\n line endings, multi-line `data:` fields and `:` comment lines.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: SseFrame[] = [];
  for (const part of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) frames.push({ event, data: data.join("\n") });
  }
  return { frames, rest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSource(value: unknown): Source | null {
  if (!isRecord(value) || typeof value.source !== "string" || typeof value.snippet !== "string") return null;
  return {
    source: value.source,
    snippet: value.snippet,
    page: typeof value.page === "number" ? value.page : null,
  };
}

/** Validate + convert one SSE frame into a typed event (unknown frames -> null). */
export function toStreamEvent(frame: SseFrame): StreamEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;

  switch (frame.event) {
    case "sources": {
      const list = Array.isArray(payload.sources) ? payload.sources : [];
      return { type: "sources", sources: list.map(toSource).filter((s): s is Source => s !== null) };
    }
    case "token":
      return typeof payload.text === "string" ? { type: "token", text: payload.text } : null;
    case "done":
      return {
        type: "done",
        conversationId: typeof payload.conversation_id === "string" ? payload.conversation_id : "",
        latencyMs: typeof payload.latency_ms === "number" ? payload.latency_ms : 0,
      };
    case "error":
      return {
        type: "error",
        code: typeof payload.code === "string" ? payload.code : "error",
        message: typeof payload.message === "string" ? payload.message : "Something went wrong.",
      };
    default:
      return null;
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  if (response.status === 429) {
    return new ApiError("You're sending messages too quickly. Please wait a moment and try again.", "rate_limited", 429);
  }
  let message = `The server responded with an error (${response.status}).`;
  let code = "http_error";
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error)) {
      if (typeof body.error.message === "string") message = body.error.message;
      if (typeof body.error.code === "string") code = body.error.code;
    }
  } catch {
    /* non-JSON error body: keep the generic message */
  }
  return new ApiError(message, code, response.status);
}

export interface StreamChatOptions {
  baseUrl: string;
  body: ChatRequestBody;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  /** Abort if no bytes arrive for this long (default 60 s). */
  idleTimeoutMs?: number;
}

/**
 * POST to /api/v1/chat/stream and dispatch typed events as they arrive.
 * Rejects with `ApiError` (network / timeout / HTTP) or the original
 * `AbortError` when the caller's signal aborts.
 */
export async function streamChat({ baseUrl, body, signal, onEvent, idleTimeoutMs = 60_000 }: StreamChatOptions): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs);
  };
  const onExternalAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    arm();
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    if (!response.body) throw new ApiError("The server sent an empty response.", "empty_response");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseFrames(buffer);
      buffer = parsed.rest;
      for (const frame of parsed.frames) {
        const event = toStreamEvent(frame);
        if (event) onEvent(event);
      }
    }
    buffer += decoder.decode();
    const tail = parseSseFrames(buffer + "\n\n");
    for (const frame of tail.frames) {
      const event = toStreamEvent(frame);
      if (event) onEvent(event);
    }
  } catch (error) {
    if (timedOut) {
      throw new ApiError("The assistant took too long to respond. Please try again.", "timeout");
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Can't reach the server. Check your connection and try again.", "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
