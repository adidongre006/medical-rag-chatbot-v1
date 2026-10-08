import { Sparkles } from "lucide-react";

export default function SuggestedPrompts({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
}) {
  return (
    <ul className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Suggested questions">
      {prompts.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            onClick={() => onPick(prompt)}
            className="group flex h-full w-full items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-left text-sm text-fg backdrop-blur-md transition-colors hover:bg-surface-hover"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <span>{prompt}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
