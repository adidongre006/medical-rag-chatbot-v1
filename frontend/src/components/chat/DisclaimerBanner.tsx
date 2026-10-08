import { ShieldAlert, X } from "lucide-react";

export default function DisclaimerBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="note"
      aria-label="Medical disclaimer"
      className="flex items-start gap-3 border-b border-warn-line bg-warn-soft px-4 py-2.5 text-sm"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">Educational use only — not medical advice.</strong>{" "}
        <span className="text-muted">
          Answers come from an indexed reference and may be incomplete. In an emergency, call your local emergency
          number.
        </span>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss disclaimer"
        className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-surface-hover"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
