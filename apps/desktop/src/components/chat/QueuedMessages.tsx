// Messages typed while Kode is still working. They wait above the composer
// and go out together as the next message as soon as the current turn ends,
// like Claude Code's queued messages.

import { Clock3, Paperclip, Send, X } from "lucide-react";
import type { StagedAttachment } from "@/components/chat/ChatInput";
import type { KodeAnnotation } from "@/lib/kode-annotations";

export type QueuedMessage = {
  id: string;
  text: string;
  modelId: string;
  attachments?: StagedAttachment[];
  reasoning?: boolean;
  annotations: KodeAnnotation[];
};

/** Several queued messages become one turn, in the order they were typed. */
export function mergeQueued(items: QueuedMessage[]): QueuedMessage | null {
  if (items.length === 0) return null;
  const last = items[items.length - 1];
  const attachments = items.flatMap((item) => item.attachments ?? []);
  return {
    id: last.id,
    text: items.map((item) => item.text.trim()).filter(Boolean).join("\n\n"),
    modelId: last.modelId,
    attachments: attachments.length > 0 ? attachments : undefined,
    reasoning: last.reasoning,
    annotations: items.flatMap((item) => item.annotations),
  };
}

export function QueuedMessages({
  items,
  onRemove,
  onSendNow,
}: {
  items: QueuedMessage[];
  onRemove: (id: string) => void;
  onSendNow: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock3 size={12} className="shrink-0" />
        <span className="flex-1">
          {items.length === 1 ? "1 message queued" : `${items.length} messages queued`}, sends when Kode finishes
        </span>
        <button
          type="button"
          onClick={onSendNow}
          title="Stop the current step and send now"
          className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground/80 hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
        >
          <Send size={11} />
          Send now
        </button>
      </div>
      {items.map((item) => (
        <div key={item.id} className="group flex min-w-0 items-center gap-2 rounded-full bg-black/[0.03] py-1 pr-1 pl-3 dark:bg-white/[0.04]">
          <p className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">{item.text || "(attachments)"}</p>
          {item.attachments?.length ? (
            <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] text-muted-foreground">
              <Paperclip size={10} />
              {item.attachments.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove queued message"
            title="Remove"
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
