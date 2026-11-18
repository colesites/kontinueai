// The context section of the composer's context popover.

import { UsageBar } from "@/components/usage/KodeUsageCard";
import { formatContextPercent } from "@/lib/kode-context-usage";

export function ChatContextSummary({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
  return (
    <>
      <div className="flex items-center justify-between text-label">
        <span className="text-foreground/90">Context · this chat</span>
        <span className="font-mono text-caption text-muted-foreground">
          {compact.format(used)} / {compact.format(max)}
          {/* Same formatter as the composer footer, so the two never disagree
              (it showed "1%" here beside "1.3%" there). */}
          <span className="ml-2 font-sans tabular-nums text-foreground/75">
            {formatContextPercent(used, max)}
          </span>
        </span>
      </div>
      <UsageBar pct={pct} />
      <p className="text-caption leading-relaxed text-muted-foreground">
        Older messages are summarized automatically when the chat gets close to
        the limit.
      </p>
    </>
  );
}
