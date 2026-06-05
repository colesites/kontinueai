import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const findings: { kind: "ok" | "warn" | "info"; text: string }[] = [
  { kind: "warn", text: "Unhandled promise in login.ts" },
  { kind: "info", text: "Consider extracting Form validation" },
  { kind: "ok", text: "Types look consistent" },
];

const meta: Record<string, { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-400/80" },
  warn: { icon: AlertTriangle, className: "text-amber-400/80" },
  info: { icon: Info, className: "text-sky-400/80" },
};

const ReviewSidebar = () => {
  return (
    <div className="flex h-full flex-col pt-2">
      <div className="px-3 pb-2 pt-1 text-[13px] font-semibold text-foreground/90">
        Review
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
          Findings
        </p>
        <div className="flex flex-col gap-1">
          {findings.map((f, i) => {
            const { icon: Icon, className } = meta[f.kind];
            return (
              <div
                key={i}
                className="surface-inset flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-foreground/75"
              >
                <Icon size={14} className={`mt-0.5 shrink-0 ${className}`} />
                <span>{f.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReviewSidebar;
