import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc } from "@repo/convex/convex/_generated/dataModel";
import { AlarmClock, Bell, BellOff, Info } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function formatWhen(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

const TYPE_ICONS = {
  task_reminder: AlarmClock,
  task_overdue: AlarmClock,
  system: Info,
} as const;

export default function NotificationsScreen() {
  const router = useRouter();
  const notifications = useQuery(api.notifications.listNotifications, {});
  const unreadCount = useQuery(api.notifications.unreadCount, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const open = (notification: Doc<"notifications">) => {
    if (!notification.read) {
      markRead({ notificationId: notification._id }).catch(() => {});
    }
    if (notification.chatId) router.push(`/chat/${notification.chatId}` as Href);
    else if (notification.taskId) router.push("/tasks" as Href);
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader
        title="Notifications"
        leading="back"
        right={
          unreadCount ? (
            <Pressable
              onPress={() => void markAllRead({}).catch(() => {})}
              className="rounded-full border border-border px-3 py-1.5 active:bg-accent"
            >
              <Text className="text-[12px] font-medium text-muted-foreground">
                Mark all read
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {notifications === undefined ? (
          <View className="gap-2 pt-2">
            {[1, 2, 3].map((i) => (
              <View key={i} className="h-16 rounded-xl bg-foreground/5" />
            ))}
          </View>
        ) : notifications.length === 0 ? (
          <View className="items-center py-20">
            <View className="h-13 w-13 items-center justify-center rounded-2xl bg-secondary" style={{ width: 52, height: 52 }}>
              <Icon as={BellOff} size={22} className="text-muted-foreground/60" />
            </View>
            <Text className="mt-4 text-[15px] font-semibold text-foreground">
              All caught up
            </Text>
            <Text className="mt-1.5 text-center text-[13px] text-muted-foreground">
              Task reminders and updates will land here.
            </Text>
          </View>
        ) : (
          notifications.map((notification) => {
            const TypeIcon = TYPE_ICONS[notification.type] ?? Bell;
            return (
              <Pressable
                key={notification._id}
                onPress={() => open(notification)}
                className={cn(
                  "mb-2 flex-row items-start gap-3 rounded-2xl border px-3.5 py-3 active:opacity-80",
                  notification.read
                    ? "border-border bg-card"
                    : "border-primary/30 bg-primary/5",
                )}
              >
                <View
                  className={cn(
                    "mt-0.5 h-9 w-9 items-center justify-center rounded-full",
                    notification.read ? "bg-secondary" : "bg-primary/15",
                  )}
                >
                  <Icon
                    as={TypeIcon}
                    size={16}
                    className={notification.read ? "text-muted-foreground" : "text-primary"}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={cn(
                      "text-[14px] text-foreground",
                      !notification.read && "font-semibold",
                    )}
                  >
                    {notification.title}
                  </Text>
                  {notification.body ? (
                    <Text numberOfLines={2} className="mt-0.5 text-[12.5px] leading-4 text-muted-foreground">
                      {notification.body}
                    </Text>
                  ) : null}
                  <Text className="mt-1 text-[11px] text-muted-foreground/70">
                    {formatWhen(notification.createdAt)}
                  </Text>
                </View>
                {!notification.read ? (
                  <View className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
