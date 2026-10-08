import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import Composer from "@/components/chat/Composer";

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const ref = createRef<HTMLTextAreaElement>();
  render(<Composer onSend={onSend} onStop={onStop} isStreaming={false} textareaRef={ref} {...props} />);
  return { onSend, onStop, input: screen.getByLabelText("Message") };
}

describe("Composer", () => {
  it("sends trimmed text on Enter and clears the field", async () => {
    const user = userEvent.setup();
    const { onSend, input } = setup();
    await user.type(input, "  hello  {Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const user = userEvent.setup();
    const { onSend, input } = setup();
    await user.type(input, "line1{Shift>}{Enter}{/Shift}line2");
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("line1\nline2");
  });

  it("does not send empty/whitespace messages and disables the button", async () => {
    const user = userEvent.setup();
    const { onSend, input } = setup();
    await user.type(input, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("shows a Stop button while streaming and blocks sending", async () => {
    const user = userEvent.setup();
    const { onSend, onStop, input } = setup({ isStreaming: true });
    await user.type(input, "draft{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("shows the character counter near the limit", async () => {
    const { input } = setup();
    // fireEvent-style bulk input: typing 1700 chars with user.type would be slow
    const user = userEvent.setup();
    await user.click(input);
    await user.paste("a".repeat(1700));
    expect(screen.getByText("1700/2000")).toBeInTheDocument();
  });
});
