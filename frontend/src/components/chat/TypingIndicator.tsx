export default function TypingIndicator() {
  return (
    <div className="flex h-7 items-center gap-1.5" role="status" aria-label="Assistant is typing">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
