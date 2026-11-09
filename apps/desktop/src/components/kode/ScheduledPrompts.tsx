import { AlarmClock, ChevronDown, Clock, Repeat, Send, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCountdown, formatResetTime } from "@/lib/kode-limits";
import { RESET_BUFFER_MS, type ScheduledPrompt } from "@/lib/kode-schedule";

const HOUR = 3_600_000;

/** Preset send times when the reset time is unknown (or as alternatives). */
function presetTimes(now: number): { label: string; at: number }[] {
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", at: now + HOUR },
    { label: "In 3 hours", at: now + 3 * HOUR },
    { label: "In 5 hours", at: now + 5 * HOUR },
    { label: "Tomorrow at 9 AM", at: tomorrow9.getTime() },
  ];
}

/** Shown under a turn that stopped on a usage limit. */
export function LimitCard({
  resetAt,
  now,
  canSchedule,
  onSchedule,
  onUseAnotherModel,
  switchTo = [],
}: {
  /** Other signed-in accounts of the same provider to retry on right away. */
  switchTo?: { id: string; label: string; onSwitch: () => void }[];
  resetAt: number | null;
  now: number;
  /** False for a chat that was never saved (nothing to send into later). */
  canSchedule: boolean;
  onSchedule: (fireAt: number) => void;
  onUseAnotherModel: () => void;
}) {
  const known = resetAt !== null && resetAt > now;
  return (
    <div className="kontinue-3d mt-3 flex flex-wrap items-center gap-2 rounded-[18px] px-3.5 py-3">
      <AlarmClock size={15} className="shrink-0 text-purple-500" />
      <p className="min-w-0 flex-1 text-[12.5px] text-foreground/80">
        {known
          ? `Limit resets at ${formatResetTime(resetAt, now)} (${formatCountdown(resetAt, now)}).`
          : "You hit a usage limit."}{" "}
        <span className="text-muted-foreground">
          {switchTo.length ? "Switch accounts and keep going, or queue it for later." : canSchedule ? "Queue this prompt or keep going on another model." : "Keep going on another model."}
        </span>
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {switchTo.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={account.onSwitch}
            title={`Switch this chat to ${account.label} and send the prompt again`}
            className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
          >
            <Repeat size={12} />
            Switch to {account.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onUseAnotherModel}
          className="kontinue-3d flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] text-foreground/85"
        >
          <Repeat size={12} />
          Use another model
        </button>
        {canSchedule ? (
          <div className="flex items-center">
            {known ? (
              <button
                type="button"
                onClick={() => onSchedule(resetAt + RESET_BUFFER_MS)}
                className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-l-full pr-2.5 pl-3 text-[12px] font-medium"
              >
                <Clock size={12} />
                Send when it resets
              </button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Pick a time to send"
                  className={
                    known
                      ? "kontinue-3d-primary flex h-8 cursor-pointer items-center rounded-r-full border-l border-white/20 pr-2.5 pl-1.5"
                      : "kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
                  }
                >
                  {known ? null : (
                    <>
                      <Clock size={12} />
                      Send later
                    </>
                  )}
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-48 p-1.5">
                {presetTimes(now).map((preset) => (
                  <DropdownMenuItem
                    key={preset.label}
                    onSelect={() => onSchedule(preset.at)}
                    className="flex items-center justify-between px-3 py-1.5 text-[12.5px]"
                  >
                    {preset.label}
                    <span className="text-[11px] text-muted-foreground">
                      {formatResetTime(preset.at, now)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Queued prompts for this chat, plus ones in other chats that are due. */
export function ScheduledBar({
  items,
  activeChatId,
  now,
  modelName,
  onSendNow,
  onCancel,
  onOpenChat,
}: {
  items: ScheduledPrompt[];
  activeChatId: string | null;
  now: number;
  modelName: (modelId: string) => string;
  onSendNow: (item: ScheduledPrompt) => void;
  onCancel: (item: ScheduledPrompt) => void;
  onOpenChat: (item: ScheduledPrompt) => void;
}) {
  const here = items.filter((item) => item.chatId === activeChatId);
  const readyElsewhere = items.filter((item) => item.chatId !== activeChatId && item.fireAt <= now);
  if (here.length === 0 && readyElsewhere.length === 0) return null;

  return (
    <div className="w-full min-w-0 space-y-1">
      {here.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-full bg-purple-500/[0.07] py-1 pr-1 pl-3 text-[12px]"
        >
          <Clock size={12} className="shrink-0 text-purple-500" />
          <span className="min-w-0 flex-1 truncate text-foreground/80">
            <span className="font-medium">
              {item.fireAt <= now ? "Sending now" : `Sends ${formatCountdown(item.fireAt, now)}`}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {formatResetTime(item.fireAt, now)} on {modelName(item.modelId)} · {item.text}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onSendNow(item)}
            className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-purple-500 hover:bg-purple-500/10"
          >
            <Send size={11} />
            Send now
          </button>
          <button
            type="button"
            aria-label="Cancel scheduled prompt"
            onClick={() => onCancel(item)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {readyElsewhere.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-full bg-purple-500/[0.07] py-1 pr-1 pl-3 text-[12px]"
        >
          <AlarmClock size={12} className="shrink-0 text-purple-500" />
          <span className="min-w-0 flex-1 truncate text-foreground/80">
            <span className="font-medium">Ready to send</span>
            <span className="text-muted-foreground">
              {" "}
              in {item.chatTitle ?? "another chat"} · {item.text}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onOpenChat(item)}
            className="flex h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-[11.5px] font-medium text-purple-500 hover:bg-purple-500/10"
          >
            Open and send
          </button>
          <button
            type="button"
            aria-label="Cancel scheduled prompt"
            onClick={() => onCancel(item)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
