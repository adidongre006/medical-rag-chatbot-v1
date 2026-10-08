import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MessageBubble from "@/components/chat/MessageBubble";
import type { ChatMessage } from "@/lib/types";

// next/dynamic lazy-loads Markdown in the app; render it synchronously in tests.
vi.mock("next/dynamic", async () => {
  const markdown = await import("@/components/chat/Markdown");
  return { default: () => markdown.default };
});

const base: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "**Bold** answer",
  createdAt: new Date(2026, 9, 5, 9, 5).getTime(),
  status: "done",
};

function renderBubble(message: ChatMessage, overrides: Partial<React.ComponentProps<typeof MessageBubble>> = {}) {
  const onRegenerate = vi.fn();
  const onFeedback = vi.fn();
  const utils = render(
    <MessageBubble message={message} canRegenerate onRegenerate={onRegenerate} onFeedback={onFeedback} {...overrides} />,
  );
  return { ...utils, onRegenerate, onFeedback };
}

describe("MessageBubble", () => {
  it("renders markdown and a zero-padded timestamp", async () => {
    renderBubble(base);
    expect(await screen.findByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("09:05")).toBeInTheDocument();
  });

  it("never executes or renders raw HTML from the model (XSS regression)", async () => {
    const { container } = renderBubble({
      ...base,
      content: 'Hi <script>window.__pwned = true</script><img src=x onerror="window.__pwned = true"> [x](javascript:alert(1))',
    });
    await screen.findByText(/Hi/);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    const link = container.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("shows collapsible sources with page numbers", async () => {
    renderBubble({ ...base, sources: [{ source: "Medical_book.pdf", page: 42, snippet: "Diabetes mellitus…" }] });
    expect(await screen.findByText("Sources (1)")).toBeInTheDocument();
    expect(screen.getByText(/page 42/)).toBeInTheDocument();
  });

  it("wires regenerate and feedback actions", async () => {
    const user = userEvent.setup();
    const { onRegenerate, onFeedback } = renderBubble(base);
    await user.click(screen.getByRole("button", { name: "Regenerate answer" }));
    await user.click(screen.getByRole("button", { name: "Good answer" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith("m1", "up");
  });

  it("shows the typing indicator while an empty answer streams, and an error with Retry", () => {
    const { rerender, onRegenerate } = renderBubble({ ...base, content: "", status: "streaming" });
    expect(screen.getByRole("status", { name: "Assistant is typing" })).toBeInTheDocument();

    rerender(
      <MessageBubble
        message={{ ...base, content: "", status: "error", error: "Can't reach the server." }}
        canRegenerate
        onRegenerate={onRegenerate}
        onFeedback={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows an emergency notice under user messages that mention an emergency", () => {
    renderBubble({ ...base, role: "user", content: "I have chest pain and can't breathe" });
    expect(screen.getByTestId("emergency-notice")).toHaveTextContent("emergency number");
  });

  it("shows crisis-line guidance for self-harm and nothing for ordinary questions", () => {
    const { unmount } = renderBubble({ ...base, role: "user", content: "I want to end my life" });
    expect(screen.getByTestId("emergency-notice")).toHaveTextContent("Tele-MANAS");
    unmount();
    renderBubble({ ...base, role: "user", content: "What causes migraines?" });
    expect(screen.queryByTestId("emergency-notice")).toBeNull();
  });

  it("renders user messages as plain text (no markdown/HTML)", () => {
    renderBubble({ ...base, role: "user", content: "<b>not bold</b>" });
    expect(screen.getByText("<b>not bold</b>")).toBeInTheDocument();
  });
});
