import { BookOpen } from "lucide-react";
import type { Source } from "@/lib/types";

/** Collapsible citations. Uses native <details> for free keyboard + screen-reader support. */
export default function SourcesPanel({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="group mt-3 rounded-xl border border-line bg-surface text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden">
        <BookOpen className="size-4 text-accent" aria-hidden />
        <span>Sources ({sources.length})</span>
        <span className="ml-auto text-xs transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <ol className="space-y-2 border-t border-line px-3 py-2.5">
        {sources.map((source, index) => (
          <li key={`${source.source}-${source.page ?? "x"}-${index}`} className="flex gap-2">
            <span className="tabular mt-0.5 text-xs text-muted">{index + 1}.</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-fg">
                {source.source}
                {source.page !== null && <span className="text-muted"> · page {source.page}</span>}
              </p>
              <p className="line-clamp-3 text-xs text-muted">{source.snippet}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
