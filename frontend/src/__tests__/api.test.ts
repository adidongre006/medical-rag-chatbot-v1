import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, parseSseFrames, streamChat, toStreamEvent } from "@/lib/api";
import type { StreamEvent } from "@/lib/types";

const enc = new TextEncoder();

function sseResponse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { ...init, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => vi.restoreAllMocks());

describe("parseSseFrames", () => {
  it("parses complete frames, ignores comments and keeps the unfinished tail", () => {
    const { frames, rest } = parseSseFrames(': connected\n\nevent: token\ndata: {"text":"Hi"}\n\nevent: tok');
    expect(frames).toEqual([{ event: "token", data: '{"text":"Hi"}' }]);
    expect(rest).toBe("event: tok");
  });

  it("handles CRLF and multi-line data", () => {
    const { frames } = parseSseFrames("event: x\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(frames).toEqual([{ event: "x", data: "a\nb" }]);
  });
});

describe("toStreamEvent", () => {
  it("maps each backend event to the typed union", () => {
    expect(toStreamEvent({ event: "token", data: '{"text":"abc"}' })).toEqual({ type: "token", text: "abc" });
    expect(
      toStreamEvent({ event: "sources", data: '{"sources":[{"source":"b.pdf","page":3,"snippet":"s"},{"bad":1}]}' }),
    ).toEqual({ type: "sources", sources: [{ source: "b.pdf", page: 3, snippet: "s" }] });
    expect(toStreamEvent({ event: "done", data: '{"conversation_id":"c_1","latency_ms":12}' })).toEqual({
      type: "done",
      conversationId: "c_1",
      latencyMs: 12,
    });
    expect(toStreamEvent({ event: "error", data: '{"code":"upstream_error","message":"nope"}' })).toEqual({
      type: "error",
      code: "upstream_error",
      message: "nope",
    });
  });

  it("returns null for malformed or unknown frames", () => {
    expect(toStreamEvent({ event: "token", data: "not json" })).toBeNull();
    expect(toStreamEvent({ event: "token", data: '{"text":5}' })).toBeNull();
    expect(toStreamEvent({ event: "weird", data: "{}" })).toBeNull();
  });
});

describe("streamChat", () => {
  const body = { message: "hi", history: [] };

  it("dispatches events even when frames are split across network chunks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        ': connected\n\nevent: sources\ndata: {"sources":[]}\n\nevent: tok',
        'en\ndata: {"text":"Hel"}\n\nevent: token\ndata: {"text":"lo"}\n\n',
        'event: done\ndata: {"conversation_id":"c_1","latency_ms":5}\n\n',
      ]),
    );
    const events: StreamEvent[] = [];
    await streamChat({ baseUrl: "http://api.test/", body, onEvent: (e) => events.push(e) });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/api/v1/chat/stream");
    expect(events.map((e) => e.type)).toEqual(["sources", "token", "token", "done"]);
  });

  it("maps HTTP errors to ApiError (429 gets a friendly message)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(streamChat({ baseUrl: "http://x", body, onEvent: () => {} })).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unavailable", message: "Loading" } }), { status: 503 }),
    );
    await expect(streamChat({ baseUrl: "http://x", body, onEvent: () => {} })).rejects.toMatchObject({
      code: "unavailable",
      message: "Loading",
    });
  });

  it("reports network failures as ApiError('network')", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await streamChat({ baseUrl: "http://x", body, onEvent: () => {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("network");
  });

  it("rethrows AbortError when the caller aborts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const promise = streamChat({ baseUrl: "http://x", body, signal: controller.signal, onEvent: () => {} });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out when the server goes silent", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const promise = streamChat({ baseUrl: "http://x", body, onEvent: () => {}, idleTimeoutMs: 1000 });
    const assertion = expect(promise).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
    vi.useRealTimers();
  });
});
