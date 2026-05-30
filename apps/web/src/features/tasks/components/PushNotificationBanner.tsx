"use client";

import { BellRing, BellOff, Check } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { usePushNotifications } from "../hooks/usePushNotifications";

// A prominent prompt to enable browser push notifications, shown on the Tasks
// page so reminders aren't gated behind the sidebar bell. Hides itself once the
// user is subscribed (or when push isn't supported in this browser).
export function PushNotificationBanner({ className }: { className?: string }) {
  const push = usePushNotifications();

  if (!push.supported) return null;
  if (push.state === "subscribed") return null;

  const blocked = push.state === "denied";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {blocked ? <BellOff size={16} /> : <BellRing size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">
          {blocked ? "Notifications are blocked" : "Get reminded on time"}
        </p>
        <p className="text-xs text-muted-foreground">
          {blocked
            ? "Allow notifications for this site in your browser settings."
            : "Turn on push notifications so task reminders reach you."}
        </p>
      </div>
      {!blocked && (
        <button
          type="button"
          disabled={push.busy}
          onClick={() => void push.subscribe()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {push.busy ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
          ) : (
            <Check size={14} />
          )}
          Enable
        </button>
      )}
    </div>
  );
}
