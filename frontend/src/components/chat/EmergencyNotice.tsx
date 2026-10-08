import { HeartPulse, LifeBuoy } from "lucide-react";
import type { EmergencyKind } from "@/lib/safety";

export default function EmergencyNotice({ kind }: { kind: EmergencyKind }) {
  const selfHarm = kind === "self-harm";
  const Icon = selfHarm ? LifeBuoy : HeartPulse;
  return (
    <div
      role="alert"
      data-testid="emergency-notice"
      className="mt-2 flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft px-3 py-2.5 text-sm"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      {selfHarm ? (
        <p>
          <strong className="font-semibold">You don&apos;t have to go through this alone.</strong> If you might act on
          these thoughts, contact your local emergency number now, or reach a crisis line in your country (for example
          988 in the US, Tele-MANAS 14416 in India). Talking to someone you trust can help too.
        </p>
      ) : (
        <p>
          <strong className="font-semibold">This may be an emergency.</strong> If this is happening to you or someone
          near you right now, call your local emergency number immediately instead of waiting for an answer here.
        </p>
      )}
    </div>
  );
}
