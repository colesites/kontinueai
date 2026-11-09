// A webhook's first message in a thread: shown as an incoming event, not as
// something you typed.

import { ChevronRight, Webhook } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

const HEAD = /^Webhook "([^"]+)" fired \(([^)]*)\)\.\s*/;

export function isWebhookEvent(role: string, content: string): boolean {
  return role === "user" && HEAD.test(content);
}

export function WebhookEventCard({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const match = content.match(HEAD);
  const name = match?.[1] ?? "Webhook";
  const source = match?.[2] ?? "";
  const body = content.replace(HEAD, "");
  const [summary, ...rest] = body.split(/\n{2,}/);
  return (
    <div className="kontinue-3d w-full rounded-[18px] px-4 py-3">
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Webhook size={13} className="shrink-0 text-purple-500" />
        <span className="font-medium text-foreground/80">{name}</span>
        {source ? <span>· {source}</span> : null}
        <span className="ml-auto">Incoming event</span>
      </div>
      <div className="mt-1.5 text-[13px] text-foreground/90">
        <MessageResponse>{summary ?? ""}</MessageResponse>
      </div>
      {rest.length ? (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 flex cursor-pointer items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
            <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
            {open ? "Hide instructions and payload" : "Show instructions and payload"}
          </button>
          {open ? (
            <div className="mt-1.5 text-[12.5px] text-foreground/75">
              <MessageResponse>{rest.join("\n\n")}</MessageResponse>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
