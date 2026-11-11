// Shown above the composer for an imported session that stopped on a usage
// limit: what was left, and one click to carry on here.

import { AlarmClock, ArrowRight } from "lucide-react";
import type { ResumeOffer } from "@/lib/kode-import-resume";

export function ImportResumeCard({
  offer,
  provider,
  onContinue,
  onDismiss,
}: {
  offer: ResumeOffer;
  /** "Claude Code", "Codex"…: where the session came from. */
  provider: string;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Continue the imported session"
      className="liquid-glass-dropdown pointer-events-auto mx-auto mb-2 w-full !rounded-[18px] px-3.5 py-3 text-foreground"
    >
      <div className="flex items-start gap-2.5">
        <AlarmClock size={15} className="mt-0.5 shrink-0 text-caution" />
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">This {provider} session stopped at a usage limit</p>
          {offer.items.length ? (
            <>
              <p className="mt-1 text-label text-muted-foreground">What was left:</p>
              <ul className="mt-1 space-y-0.5 text-label text-foreground/85">
                {offer.items.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <span aria-hidden className="text-muted-foreground">•</span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-1.5 text-label text-muted-foreground">Kode can pick it up now, on the model selected below.</p>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-7 items-center rounded-full px-2.5 text-label text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="kontinue-3d-primary flex h-7 items-center gap-1.5 rounded-full px-3 text-label font-medium"
        >
          Continue here
          <ArrowRight size={12} />
        </button>
      </div>
    </section>
  );
}
