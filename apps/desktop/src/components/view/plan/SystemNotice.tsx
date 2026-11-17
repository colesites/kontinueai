// A notice between turns (limits, retries, imported terminal runs).

import { AlertTriangle, Info } from "lucide-react";
import { CommandBlock } from "@/components/chat/ToolStep";

export const formatRelativeTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  return `${Math.floor(diff / day)} d ago`;
};

export function SystemNotice({
  content,
  createdAt,
}: {
  content: string;
  createdAt?: number;
}) {
  const normalized = content.trim();
  const warning = /limit|reached/i.test(normalized);
  const terminal = normalized.startsWith("Ran:");

  if (terminal) {
    return (
      <CommandBlock
        command={normalized.replace(/^Ran:\s*/, "")}
        status="done"
      />
    );
  }

  return (
    <div
      className={`flex items-start justify-center gap-2 py-1 text-center text-label leading-snug ${warning ? "text-amber-600 dark:text-amber-400/90" : "text-foreground/60"}`}
    >
      <span className="mt-2 h-px w-8 shrink-0 bg-black/10 dark:bg-white/10" />
      {warning ? (
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      ) : (
        <Info size={12} className="mt-0.5 shrink-0" />
      )}
      {/* Notices wrap: they often say what to do next. */}
      <span className="max-w-lg text-left">{normalized}</span>
      {createdAt ? (
        <span className="shrink-0 text-foreground/25">
          {formatRelativeTime(createdAt)}
        </span>
      ) : null}
      <span className="h-px w-8 bg-white/10" />
    </div>
  );
}
