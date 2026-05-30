"use client";

import Link from "next/link";
import { Bell, BellOff, BellRing, CheckCheck } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { cn } from "@repo/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { usePushNotifications } from "../../features/tasks/hooks/usePushNotifications";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationsBell() {
  const notifications = useQuery(api.notifications.listNotifications, {});
  const unread = useQuery(api.notifications.unreadCount, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const push = usePushNotifications();

  const count = unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
        >
          <Bell size={15} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[15px] text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 overflow-hidden border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <div className="flex items-center justify-between border-b border-sidebar-border/70 px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead({})}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications === undefined ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              You’re all caught up.
            </p>
          ) : (
            notifications.map((n) => {
              const href = n.taskId
                ? "/tasks"
                : n.chatId
                  ? `/chat/${n.chatId as Id<"chats">}`
                  : "#";
              return (
                <Link
                  key={n._id}
                  href={href}
                  onClick={() => void markRead({ notificationId: n._id })}
                  className={cn(
                    "flex flex-col gap-0.5 border-b border-sidebar-border/50 px-3 py-2.5 transition-colors hover:bg-foreground/5",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="flex-1 truncate text-sm font-medium">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="line-clamp-2 pl-0 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                </Link>
              );
            })
          )}
        </div>

        {push.supported && (
          <div className="border-t border-sidebar-border/70 px-3 py-2">
            {push.state === "subscribed" ? (
              <button
                type="button"
                disabled={push.busy}
                onClick={() => void push.unsubscribe()}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <BellOff size={12} />
                Disable push notifications
              </button>
            ) : push.state === "denied" ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <BellOff size={12} />
                Push blocked in browser settings
              </span>
            ) : (
              <button
                type="button"
                disabled={push.busy}
                onClick={() => void push.subscribe()}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary transition-colors hover:opacity-80 disabled:opacity-50"
              >
                <BellRing size={12} />
                Enable push notifications
              </button>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
