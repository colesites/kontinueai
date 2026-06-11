import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc } from "@repo/convex/convex/_generated/dataModel";
import {
  Bell,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  Columns3,
  Flag,
  List,
  ListChecks,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "list", icon: List },
  { id: "kanban", icon: Columns3 },
  { id: "calendar", icon: CalendarDays },
] as const;

// Mirrors web PRIORITY_META (task-shared.ts); medium is hidden like web.
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "#ef4444" },
  high: { label: "High", color: "#f97316" },
  medium: { label: "Medium", color: "#f59e0b" },
  low: { label: "Low", color: "#9ca3af" },
};

function formatDue(dueDate: number): string {
  const due = new Date(dueDate);
  const now = new Date();
  const sameDay = due.toDateString() === now.toDateString();
  const time = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const date = due.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

export default function TasksScreen() {
  const tasks = useQuery(api.tasks.listTasks, {});
  const createTask = useMutation(api.tasks.createTask);
  const toggleTaskComplete = useMutation(api.tasks.toggleTaskComplete);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const { open, completed } = useMemo(() => {
    const all = tasks ?? [];
    return {
      open: all.filter((t) => t.status !== "done"),
      completed: all.filter((t) => t.status === "done"),
    };
  }, [tasks]);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || isAdding) return;
    setIsAdding(true);
    try {
      await createTask({ title });
      setNewTitle("");
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      Alert.alert("Couldn't add task", data?.message ?? "Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = (task: Doc<"tasks">) => {
    toggleTaskComplete({ taskId: task._id }).catch(() =>
      Alert.alert("Couldn't update task", "Please try again."),
    );
  };

  const handleDelete = (task: Doc<"tasks">) => {
    Alert.alert("Delete task?", `"${task.title}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteTask({ taskId: task._id }).catch(() =>
            Alert.alert("Couldn't delete task", "Please try again."),
          );
        },
      },
    ]);
  };

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
          {open.length} open · {completed.length} completed
        </Text>
      </View>

      {/* Quick add */}
      <View className="mx-4 mt-3 rounded-2xl border border-border bg-card p-2.5">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Add a task…"
            placeholderTextColor="#7c6c77"
            returnKeyType="done"
            onSubmitEditing={() => void handleAdd()}
            className="flex-1 px-1 text-[15px] text-foreground"
          />
          <Pressable
            disabled={!newTitle.trim() || isAdding}
            onPress={() => void handleAdd()}
            className={cn(
              "h-9 w-9 items-center justify-center rounded-xl",
              newTitle.trim() && !isAdding ? "bg-primary active:opacity-90" : "bg-primary/40",
            )}
          >
            <Icon as={Plus} size={18} className="text-primary-foreground" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 pt-5 gap-5"
        showsVerticalScrollIndicator={false}
      >
        {tasks === undefined ? (
          <View className="gap-2">
            {[1, 2, 3].map((i) => (
              <View key={i} className="h-12 rounded-xl bg-foreground/5" />
            ))}
          </View>
        ) : tasks.length === 0 ? (
          <View className="items-center py-14">
            <Icon as={ListChecks} size={22} className="text-muted-foreground/60" />
            <Text className="mt-3 text-center text-[14px] text-muted-foreground">
              No tasks yet. Add one above or ask the AI to create one.
            </Text>
          </View>
        ) : (
          <>
            {open.length > 0 ? (
              <TaskGroup
                label="Upcoming"
                tasks={open}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ) : null}
            {completed.length > 0 ? (
              <TaskGroup
                label="Completed"
                tasks={completed}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskGroup({
  label,
  tasks,
  onToggle,
  onDelete,
}: {
  label: string;
  tasks: Doc<"tasks">[];
  onToggle: (task: Doc<"tasks">) => void;
  onDelete: (task: Doc<"tasks">) => void;
}) {
  // Captured once per mount — React Compiler forbids Date.now() in render.
  const [renderedAt] = useState(() => Date.now());
  return (
    <View>
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label} <Text className="text-muted-foreground/40">{tasks.length}</Text>
      </Text>
      <View className="gap-0.5">
        {tasks.map((t) => {
          const done = t.status === "done";
          const priority = PRIORITY_META[t.priority] ?? PRIORITY_META.medium!;
          const overdue = !done && t.dueDate != null && t.dueDate < renderedAt;
          return (
            // Mirrors web TaskRow: round check button · title + meta · trash
            <View
              key={t._id}
              className="flex-row items-center gap-3 rounded-xl px-2 py-2"
            >
              <Pressable
                onPress={() => onToggle(t)}
                hitSlop={8}
                className={cn(
                  "h-5 w-5 items-center justify-center rounded-full border",
                  done ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}
              >
                {done ? (
                  <Icon as={Check} size={12} strokeWidth={3} className="text-primary-foreground" />
                ) : null}
              </Pressable>

              <Pressable onPress={() => onToggle(t)} className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className={cn(
                    "text-[14px] text-foreground",
                    done && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-2.5">
                  {t.dueDate != null ? (
                    <View className="flex-row items-center gap-1">
                      <Icon
                        as={CalendarClock}
                        size={11}
                        className={overdue ? "text-red-500" : "text-muted-foreground"}
                      />
                      <Text
                        className={cn(
                          "text-[11px]",
                          overdue ? "text-red-500" : "text-muted-foreground",
                        )}
                      >
                        {formatDue(t.dueDate)}
                      </Text>
                    </View>
                  ) : null}
                  {t.priority !== "medium" ? (
                    <View className="flex-row items-center gap-1">
                      <Icon as={Flag} size={11} color={priority.color} />
                      <Text className="text-[11px]" style={{ color: priority.color }}>
                        {priority.label}
                      </Text>
                    </View>
                  ) : null}
                  {t.reminderMinutesBefore != null ? (
                    <Icon as={Bell} size={11} className="text-muted-foreground" />
                  ) : null}
                  {t.recurring ? (
                    <Icon as={Repeat} size={11} className="text-muted-foreground" />
                  ) : null}
                  {t.isAgentTask ? (
                    <View className="flex-row items-center gap-1">
                      <Icon as={Bot} size={11} className="text-primary" />
                      <Text className="text-[11px] text-primary">K-AI</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>

              <Pressable
                onPress={() => onDelete(t)}
                hitSlop={6}
                className="h-7 w-7 items-center justify-center rounded-lg active:bg-foreground/8"
              >
                <Icon as={Trash2} size={14} className="text-muted-foreground" />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
