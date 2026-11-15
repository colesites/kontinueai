// Catches a crash inside one view (a chat, Canvas, Tasks, Settings…) so the
// rest of the app keeps working: the sidebar stays usable, switching to another
// chat or tab clears it, and "Try again" re-renders the view.

import React, { useState } from "react";
import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import { describeError } from "@/lib/describe-error";

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail, full } = describeError(error);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the details are still selectable below.
    }
  };

  return (
    <div role="alert" className="grid h-full min-h-0 w-full flex-1 place-items-center p-8 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card/60 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              The rest of the app still works. Try again, or pick another chat. If it keeps happening, copy the
              details and send them to support@kontinueai.com.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 pl-7">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <RotateCcw className="size-3.5" />
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
        <details className="mt-3 pl-7">
          <summary className="cursor-pointer text-xs text-muted-foreground/70">Details</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 text-[11px] text-red-300/90">
            {full}
          </pre>
        </details>
      </section>
    </div>
  );
}

type Props = {
  /** When this changes (another chat or tab), the error clears. */
  resetKey: string;
  /** Short name for logs. */
  name: string;
  children: React.ReactNode;
};

export class ViewErrorBoundary extends React.Component<Props, { error: unknown | null }> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error(`[view:${this.props.name}] crashed`, error);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) this.setState({ error: null });
  }

  render() {
    if (this.state.error !== null) {
      return <ErrorPanel error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
