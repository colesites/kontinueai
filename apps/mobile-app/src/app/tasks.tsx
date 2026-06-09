import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  CalendarDays,
  Circle,
  CheckCircle2,
  Columns3,
  Flag,
  List,
  Plus,
  Repeat,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  due: string;
  priority?: "high" | "urgent";
  recurring?: boolean;
  done?: boolean;
};

const TODAY: Task[] = [
  { id: "1", title: "Add new connectors", due: "5:00 PM", priority: "high" },
  { id: "2", title: "Weekly review", due: "8:00 PM", recurring: true },
];
const COMPLETED: Task[] = [
  { id: "3", title: "Market Kontinue AI", due: "May 31", priority: "high", done: true },
];

const VIEWS = [
  { id: "list", icon: List },
  { id: "kanban", icon: Columns3 },
  { id: "calendar", icon: CalendarDays },
] as const;

export default function TasksScreen() {
  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader
        title="Tasks"
        right={
          <View className="flex-row items-center gap-1.5">
            <Pressable className="h-9 w-9 items-center justify-center rounded-xl bg-primary/15 active:opacity-80">
              <Icon as={Bell} size={17} className="text-primary" />
            </Pressable>
            <View className="flex-row items-center gap-0.5 rounded-xl bg-secondary p-0.5">
              {VIEWS.map((v, i) => (
                <View
                  key={v.id}
                  className={cn(
                    "h-8 w-8 items-center justify-center rounded-lg",
                    i === 0 && "bg-background",
                  )}
                >
                  <Icon
                    as={v.icon}
                    size={15}
                    className={i === 0 ? "text-foreground" : "text-muted-foreground"}
                  />
                </View>
              ))}
            </View>
          </View>
        }
      />

      <View className="px-4">
        <Text className="text-[12px] text-muted-foreground">
          {TODAY.length} open · {COMPLETED.length} completed
        </Text>
      </View>

      {/* Quick add */}
      <View className="mx-4 mt-3 rounded-2xl border border-border bg-card p-2.5">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 px-1 text-[15px] text-muted-foreground/60">
            Add a task…
          </Text>
          <Pressable className="h-9 w-9 items-center justify-center rounded-xl bg-primary active:opacity-90">
            <Icon as={Plus} size={18} className="text-primary-foreground" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 pt-5 gap-5"
        showsVerticalScrollIndicator={false}
      >
        <TaskGroup label="Today" tasks={TODAY} />
        <TaskGroup label="Completed" tasks={COMPLETED} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskGroup({ label, tasks }: { label: string; tasks: Task[] }) {
  return (
    <View>
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label} <Text className="text-muted-foreground/40">{tasks.length}</Text>
      </Text>
      <View className="gap-1">
        {tasks.map((t) => (
          <View key={t.id} className="flex-row items-center gap-3 py-2">
            <Icon
              as={t.done ? CheckCircle2 : Circle}
              size={20}
              className={t.done ? "text-primary" : "text-muted-foreground/50"}
            />
            <View className="flex-1">
              <Text
                className={cn(
                  "text-[15px] text-foreground",
                  t.done && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-2.5">
                <Text className="text-[12px] text-muted-foreground">{t.due}</Text>
                {t.priority ? (
                  <View className="flex-row items-center gap-1">
                    <Icon as={Flag} size={11} className="text-amber-500" />
                    <Text className="text-[11px] capitalize text-amber-500">
                      {t.priority}
                    </Text>
                  </View>
                ) : null}
                {t.recurring ? (
                  <Icon as={Repeat} size={11} className="text-muted-foreground" />
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
