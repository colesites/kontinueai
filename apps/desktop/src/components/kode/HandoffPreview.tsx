import { DismissOnEscape } from "@/components/ui/dismiss-on-escape";
// "Preview hand-off": the exact text the next model gets when it joins a chat
// with no session of its own (switching to a CLI model or another account).
// Secrets found in it (say, a token in a terminal log) are already removed;
// this shows how many and where, before you send.

import { Eye, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SECRET_MARK } from "@/lib/kode-secrets";

export type HandoffPreviewData = {
  text: string;
  redactions: number;
  kinds: string[];
  includedMessages: number;
  omittedMessages: number;
  files: number;
  fromModel: string | null;
};

export function HandoffChip({ toModel, onOpen }: { toModel: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="liquid-glass-pill pointer-events-auto mx-auto mb-2 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-caption text-foreground/70 hover:text-foreground"
      title="See exactly what the next model will be given"
    >
      <Eye size={12} className="text-purple-500" />
      Your next message hands this chat to {toModel}. Preview hand-off
    </button>
  );
}

export function HandoffPreviewDialog({
  toModel,
  load,
  onClose,
}: {
  toModel: string;
  load: () => Promise<HandoffPreviewData | null>;
  onClose: () => void;
}) {
  const [data, setData] = useState<HandoffPreviewData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    load().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  const parts = data ? data.text.split(SECRET_MARK) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center kontinue-scrim p-4" role="dialog" aria-modal="true">
      <DismissOnEscape onClose={onClose} />
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="liquid-glass-dropdown relative z-10 flex max-h-[86vh] w-full max-w-[680px] flex-col overflow-hidden text-foreground">
        <div className="flex items-center gap-2 px-5 pt-4 pb-3">
          <h2 className="min-w-0 flex-1 truncate text-lead font-semibold">Hand-off to {toModel}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        {data === undefined && !error ? (
          <p className="flex items-center gap-2 px-5 pb-5 text-label text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Building the hand-off…
          </p>
        ) : error ? (
          <p className="px-5 pb-5 text-label text-rose-400">{error}</p>
        ) : !data ? (
          <p className="px-5 pb-5 text-label text-muted-foreground">Nothing to hand off yet: this chat has no earlier turns.</p>
        ) : (
          <>
            <div className="space-y-1 px-5 pb-3 text-label text-muted-foreground">
              <p>
                {data.includedMessages} message{data.includedMessages === 1 ? "" : "s"} included
                {data.omittedMessages ? `, ${data.omittedMessages} older left out to fit` : ""}
                {data.files ? ` · ${data.files} changed file${data.files === 1 ? "" : "s"} listed` : ""}
                {data.fromModel ? ` · taking over from ${data.fromModel}` : ""}
              </p>
              <p className="flex items-center gap-1.5">
                <ShieldCheck size={12} className={data.redactions ? "text-amber-500" : "text-emerald-500"} />
                {data.redactions
                  ? `${data.redactions} secret${data.redactions === 1 ? "" : "s"} removed (${[...new Set(data.kinds)].join(", ")}), marked below.`
                  : "No secrets found in it."}
              </p>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto border-t border-black/[0.06] px-5 py-3 font-mono text-caption leading-relaxed whitespace-pre-wrap text-foreground/80 dark:border-white/[0.06]">
              {parts.map((part, index) => (
                <span key={index}>
                  {part}
                  {index < parts.length - 1 ? (
                    <mark className="rounded bg-amber-500/20 px-1 text-amber-700 dark:text-amber-300">{SECRET_MARK}</mark>
                  ) : null}
                </span>
              ))}
            </pre>
            <p className="border-t border-black/[0.06] px-5 py-2.5 text-caption text-muted-foreground dark:border-white/[0.06]">
              Your next message is added after this. To keep something out, edit or delete that message in the chat first.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
