"use client";

import { BellRing, BellOff, Bell } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { usePushNotifications } from "../hooks/usePushNotifications";

// Persistent notification control for the Tasks header. Unlike the banner (which
// self-hides once subscribed), this is always visible so users can see whether
// reminders are on and toggle them at any time.
export function TaskNotificationToggle({ className }: { className?: string }) {
  const push = usePushNotifications();

  if (!push.supported) return null;

  const subscribed = push.state === "subscribed";
  const blocked = push.state === "denied";

  const label = blocked
    ? "Notifications blocked — enable them in your browser settings"
    : subscribed
      ? "Reminders on — click to turn off"
      : "Turn on task reminders";

  const Icon = blocked ? BellOff : subscribed ? BellRing : Bell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={push.busy || blocked}
          onClick={() => {
            if (subscribed) void push.unsubscribe();
            else void push.subscribe();
          }}
          aria-label={label}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors",
            subscribed
              ? "bg-primary/10 text-primary hover:bg-primary/15"
              : "bg-foreground/5 text-muted-foreground hover:text-foreground",
            (push.busy || blocked) && "opacity-60",
            className,
          )}
        >
          {push.busy ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current" />
          ) : (
            <Icon size={14} />
          )}
          <span className="hidden sm:inline">
            {subscribed ? "Reminders on" : "Reminders"}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}
