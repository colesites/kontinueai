import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExpoDateTimePicker from "@expo/ui/community/datetime-picker";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc } from "@repo/convex/convex/_generated/dataModel";
import {
  Bell,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Flag,
  List,
  ListChecks,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/app-errors";
import { isPushEnabled, requestPushPermission } from "@/lib/push-notifications";
import { cn } from "@/lib/utils";

type Task = Doc<"tasks">;
type TaskView = "list" | "kanban" | "calendar";
type TaskPriority = Task["priority"];
type TaskStatus = Task["status"];

const VIEWS: { id: TaskView; label: string; icon: typeof List }[] = [
  { id: "list", label: "List", icon: List },
  { id: "kanban", label: "Board", icon: Columns3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
// Same class names as web task-shared PRIORITY_META (no hand-written hex).
const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "text-red-500" },
  high: { label: "High", className: "text-orange-500" },
  medium: { label: "Medium", className: "text-amber-500" },
  low: { label: "Low", className: "text-muted-foreground" },
};

// Mirrors web task-shared RECURRENCE_OPTIONS.
const RECURRENCE_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Does not repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
  { value: "FREQ=YEARLY", label: "Yearly" },
];

// Mirrors web task-shared REMINDER_OPTIONS (plus "Custom time…" below).
const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 5, label: "5 min before" },
  { value: 15, label: "15 min before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];
const PRESET_REMINDERS = REMINDER_OPTIONS.map((o) => o.value).filter(
  (m): m is number => m != null,
);

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function formatDue(dueDate: number): string {
  const due = new Date(dueDate);
  const now = new Date();
  const sameDay = due.toDateString() === now.toDateString();
  const time = due.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today, ${time}`;
  return `${due.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}, ${time}`;
}

function dateKey(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function dateLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function TasksScreen() {
  const tasks = useQuery(api.tasks.listTasks, {});
  const createTask = useMutation(api.tasks.createTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const toggleTaskComplete = useMutation(api.tasks.toggleTaskComplete);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const [view, setView] = useState<TaskView>("list");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    void isPushEnabled().then(setPushEnabled);
  }, []);

  const counts = useMemo(() => {
    const all = tasks ?? [];
    return {
      open: all.filter((task) => task.status !== "done").length,
      completed: all.filter((task) => task.status === "done").length,
    };
  }, [tasks]);

  const openNewTask = () => {
    setEditingTask(null);
    setComposerOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setComposerOpen(true);
  };

  const handleToggle = (task: Task) => {
    void toggleTaskComplete({ taskId: task._id }).catch((error) =>
      toast.error("Couldn't update task", {
        description: errorMessage(error, "Please try again."),
      }),
    );
  };

  const handleStatus = (task: Task, status: TaskStatus) => {
    void updateTask({ taskId: task._id, status }).catch((error) =>
      toast.error("Couldn't move task", {
        description: errorMessage(error, "Please try again."),
      }),
    );
  };

  const handleDelete = (task: Task) => {
    Alert.alert(
      "Delete task?",
      `“${task.title}” will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteTask({ taskId: task._id }).catch((error) =>
              toast.error("Couldn't delete task", {
                description: errorMessage(error, "Please try again."),
              }),
            );
          },
        },
      ],
    );
  };

  const enableNotifications = async () => {
    try {
      const enabled = await requestPushPermission();
      setPushEnabled(enabled);
      if (enabled) {
        toast.success("Reminders enabled", {
          description: "Task reminders can now reach this device.",
        });
      } else {
        toast.info("Notifications are off", {
          description: "Enable notifications in system settings to receive reminders.",
        });
      }
    } catch (error) {
      toast.error("Couldn't enable reminders", {
        description: errorMessage(error, "Please try again."),
      });
    }
  };

  const saveTask = async (draft: TaskDraft) => {
    if (editingTask) {
      await updateTask({
        taskId: editingTask._id,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        dueDate: draft.dueDate,
        reminderMinutesBefore:
          draft.dueDate == null ? null : draft.reminderMinutesBefore,
        recurring: draft.recurrenceRule != null,
        recurrenceRule: draft.recurrenceRule,
        isAgentTask: draft.isAgentTask,
        aiInstruction: draft.isAgentTask ? draft.aiInstruction : null,
      });
      return;
    }

    await createTask({
      title: draft.title,
      description: draft.description || undefined,
      priority: draft.priority,
      dueDate: draft.dueDate ?? undefined,
      reminderMinutesBefore:
        draft.dueDate == null
          ? undefined
          : (draft.reminderMinutesBefore ?? undefined),
      recurring: draft.recurrenceRule != null,
      recurrenceRule: draft.recurrenceRule ?? undefined,
      isAgentTask: draft.isAgentTask,
      aiInstruction:
        draft.isAgentTask && draft.aiInstruction
          ? draft.aiInstruction
          : undefined,
    });
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader
        title="Tasks"
        right={
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                pushEnabled ? "Task reminders enabled" : "Enable task reminders"
              }
              onPress={() => void enableNotifications()}
              className={cn(
                "h-11 w-11 items-center justify-center rounded-xl border",
                pushEnabled
                  ? "border-primary/35 bg-primary/12"
                  : "border-border bg-secondary",
              )}
            >
              <Icon
                as={Bell}
                size={18}
                className={
                  pushEnabled ? "text-primary" : "text-muted-foreground"
                }
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create task"
              onPress={openNewTask}
              className="h-11 flex-row items-center gap-2 rounded-xl bg-primary px-3.5 active:opacity-90"
            >
              <Icon as={Plus} size={18} className="text-primary-foreground" />
              <Text className="text-[13px] font-semibold text-primary-foreground">
                New
              </Text>
            </Pressable>
          </View>
        }
      />

      <View className="px-4">
        <Text className="text-[12px] text-muted-foreground">
          {counts.open} open · {counts.completed} completed
        </Text>

        <View className="mt-4 flex-row gap-1 rounded-xl border border-foreground/5 bg-foreground/4 p-1">
          {VIEWS.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === item.id }}
              onPress={() => setView(item.id)}
              className={cn(
                "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg",
                view === item.id ? "bg-card" : "active:bg-foreground/5",
              )}
            >
              <Icon
                as={item.icon}
                size={15}
                className={
                  view === item.id ? "text-foreground" : "text-muted-foreground"
                }
              />
              <Text
                className={cn(
                  "text-[12.5px] font-medium",
                  view === item.id
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-12 pt-5"
        showsVerticalScrollIndicator={false}
      >
        {tasks === undefined ? (
          <TaskSkeleton />
        ) : tasks.length === 0 ? (
          <EmptyTasks onCreate={openNewTask} />
        ) : view === "list" ? (
          <ListView
            tasks={tasks}
            onEdit={openEdit}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ) : view === "kanban" ? (
          <KanbanView
            tasks={tasks}
            onEdit={openEdit}
            onStatus={handleStatus}
            onDelete={handleDelete}
          />
        ) : (
          <CalendarView tasks={tasks} onEdit={openEdit} onToggle={handleToggle} />
        )}
      </ScrollView>

      <TaskComposer
        visible={composerOpen}
        task={editingTask}
        onClose={() => setComposerOpen(false)}
        onSave={saveTask}
      />
    </SafeAreaView>
  );
}

function TaskSkeleton() {
  return (
    <View className="gap-3">
      {[1, 2, 3, 4].map((item) => (
        <View key={item} className="h-20 rounded-2xl bg-foreground/5" />
      ))}
    </View>
  );
}

function EmptyTasks({ onCreate }: { onCreate: () => void }) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-border px-6 py-14">
      <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Icon as={ListChecks} size={22} className="text-primary" />
      </View>
      <Text className="mt-4 text-[16px] font-semibold text-foreground">
        Your day is clear
      </Text>
      <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
        Add a task, schedule a reminder, or let K-AI run an instruction later.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onCreate}
        className="mt-5 min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-4 active:opacity-90"
      >
        <Icon as={Plus} size={16} className="text-primary-foreground" />
        <Text className="text-[13px] font-semibold text-primary-foreground">
          Create task
        </Text>
      </Pressable>
    </View>
  );
}

function ListView({
  tasks,
  onEdit,
  onToggle,
  onDelete,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [renderedAt] = useState(() => Date.now());
  const groups = useMemo(() => {
    const result: { label: string; tasks: Task[] }[] = [
      { label: "Overdue", tasks: [] },
      { label: "Today", tasks: [] },
      { label: "Upcoming", tasks: [] },
      { label: "No date", tasks: [] },
      { label: "Completed", tasks: [] },
    ];
    const today = new Date(renderedAt).toDateString();
    for (const task of tasks) {
      if (task.status === "done") result[4]!.tasks.push(task);
      else if (task.dueDate == null) result[3]!.tasks.push(task);
      else if (task.dueDate < renderedAt) result[0]!.tasks.push(task);
      else if (new Date(task.dueDate).toDateString() === today)
        result[1]!.tasks.push(task);
      else result[2]!.tasks.push(task);
    }
    return result.filter((group) => group.tasks.length > 0);
  }, [renderedAt, tasks]);

  return (
    <View className="gap-6">
      {groups.map((group) => (
        <View key={group.label}>
          <Text className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {group.label} · {group.tasks.length}
          </Text>
          <View className="gap-2">
            {group.tasks.map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                onEdit={onEdit}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function TaskCard({
  task,
  onEdit,
  onToggle,
  onDelete,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const { primary } = useTheme();
  const done = task.status === "done";
  const priority = PRIORITY_META[task.priority];
  return (
    <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-card p-2">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        onPress={() => onToggle(task)}
        className="h-11 w-11 items-center justify-center"
      >
        <View
          className={cn(
            "h-6 w-6 items-center justify-center rounded-full border",
            done ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
        >
          {done ? (
            <Icon
              as={Check}
              size={13}
              strokeWidth={3}
              className="text-primary-foreground"
            />
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${task.title}`}
        onPress={() => onEdit(task)}
        className="min-h-14 min-w-0 flex-1 justify-center py-1"
      >
        <Text
          numberOfLines={2}
          className={cn(
            "text-[14px] font-medium leading-5 text-foreground",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {task.dueDate != null ? (
            <TaskMeta icon={CalendarClock} label={formatDue(task.dueDate)} />
          ) : null}
          {task.priority !== "medium" ? (
            <TaskMeta
              icon={Flag}
              label={priority.label}
              className={priority.className}
            />
          ) : null}
          {task.recurring ? <TaskMeta icon={Repeat} label="Repeats" /> : null}
          {task.isAgentTask ? (
            <TaskMeta icon={Bot} label="K-AI" color={primary} />
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${task.title}`}
        onPress={() => onDelete(task)}
        className="h-11 w-11 items-center justify-center rounded-xl active:bg-destructive/10"
      >
        <Icon as={Trash2} size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

function TaskMeta({
  icon,
  label,
  color,
  className,
}: {
  icon: typeof Flag;
  label: string;
  color?: string;
  /** Text-color class (priority tones, mirroring web). */
  className?: string;
}) {
  const tone = className ?? (color ? undefined : "text-muted-foreground");
  return (
    <View className="flex-row items-center gap-1">
      <Icon as={icon} size={11} color={color} className={tone} />
      <Text
        className={cn("text-[11px]", tone ?? "text-muted-foreground")}
        style={color ? { color } : undefined}
      >
        {label}
      </Text>
    </View>
  );
}

function KanbanView({
  tasks,
  onEdit,
  onStatus,
  onDelete,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <View className="gap-5">
      {KANBAN_COLUMNS.map((column, columnIndex) => {
        const columnTasks = tasks.filter(
          (task) => task.status === column.status,
        );
        return (
          <View
            key={column.status}
            className="rounded-[20px] border border-foreground/6 bg-foreground/3 p-3"
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[13px] font-semibold text-foreground">
                {column.label}
              </Text>
              <View className="rounded-full bg-secondary px-2 py-0.5">
                <Text className="text-[11px] text-muted-foreground">
                  {columnTasks.length}
                </Text>
              </View>
            </View>
            {columnTasks.length === 0 ? (
              <Text className="py-4 text-center text-[12px] text-muted-foreground">
                Nothing here
              </Text>
            ) : (
              <View className="gap-2">
                {columnTasks.map((task) => (
                  <Pressable
                    key={task._id}
                    onPress={() => onEdit(task)}
                    className="rounded-2xl border border-foreground/8 bg-card p-3 active:opacity-90"
                  >
                    <View className="flex-row items-start gap-2">
                      <Text className="flex-1 text-[13.5px] font-medium leading-5 text-foreground">
                        {task.title}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${task.title}`}
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          onDelete(task);
                        }}
                        className="-mr-1 -mt-1 h-8 w-8 items-center justify-center rounded-full active:bg-destructive/10"
                      >
                        <Icon as={Trash2} size={14} className="text-muted-foreground" />
                      </Pressable>
                    </View>
                    {task.dueDate ? (
                      <Text className="mt-1 text-[11px] text-muted-foreground">
                        {formatDue(task.dueDate)}
                      </Text>
                    ) : null}
                    <View className="mt-3 flex-row gap-2">
                      {columnIndex > 0 ? (
                        <StatusButton
                          label={KANBAN_COLUMNS[columnIndex - 1]!.label}
                          onPress={() =>
                            onStatus(
                              task,
                              KANBAN_COLUMNS[columnIndex - 1]!.status,
                            )
                          }
                        />
                      ) : null}
                      {columnIndex < KANBAN_COLUMNS.length - 1 ? (
                        <StatusButton
                          label={KANBAN_COLUMNS[columnIndex + 1]!.label}
                          forward
                          onPress={() =>
                            onStatus(
                              task,
                              KANBAN_COLUMNS[columnIndex + 1]!.status,
                            )
                          }
                        />
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function StatusButton({
  label,
  onPress,
  forward = false,
}: {
  label: string;
  onPress: () => void;
  forward?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="min-h-9 flex-row items-center gap-1 rounded-full border border-foreground/8 bg-foreground/4 px-3 active:bg-foreground/8"
    >
      <Text className="text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Text>
      {forward ? (
        <Icon as={ChevronRight} size={12} className="text-muted-foreground" />
      ) : null}
    </Pressable>
  );
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Web TaskCalendar: month grid with task dots, then the chosen day's tasks. */
function CalendarView({
  tasks,
  onEdit,
  onToggle,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  // Captured once (React Compiler forbids reading the clock during render).
  const [today] = useState(() => startOfDay(Date.now()));
  const [month, setMonth] = useState(() => {
    const d = new Date(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(today);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.dueDate == null) continue;
      const key = dateKey(startOfDay(task.dueDate));
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
    }
    return map;
  }, [tasks]);

  const first = new Date(month.year, month.month, 1);
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      new Date(month.year, month.month, index + 1).getTime(),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedTasks = byDay.get(dateKey(selectedDay)) ?? [];
  const undated = tasks.filter((task) => task.dueDate == null && task.status !== "done").length;
  const shiftMonth = (delta: number) =>
    setMonth((current) => {
      const d = new Date(current.year, current.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <View className="gap-4">
      <View className="rounded-[22px] border border-foreground/8 bg-card p-3">
        <View className="mb-2 flex-row items-center gap-1 px-1">
          <Text className="flex-1 text-[15px] font-semibold tracking-tight text-foreground">
            {first.toLocaleDateString([], { month: "long", year: "numeric" })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const d = new Date(today);
              setMonth({ year: d.getFullYear(), month: d.getMonth() });
              setSelectedDay(today);
            }}
            className="h-8 justify-center rounded-full border border-foreground/8 bg-foreground/4 px-3 active:bg-foreground/8"
          >
            <Text className="text-[11.5px] font-semibold text-foreground">Today</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => shiftMonth(-1)}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-foreground/8"
          >
            <Icon as={ChevronLeft} size={16} className="text-muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => shiftMonth(1)}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-foreground/8"
          >
            <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
        <View className="flex-row">
          {WEEKDAYS.map((day, index) => (
            <Text
              key={`${day}-${index}`}
              className="flex-1 py-1.5 text-center text-[10.5px] font-semibold uppercase text-muted-foreground/70"
            >
              {day}
            </Text>
          ))}
        </View>
        <View className="flex-row flex-wrap">
          {cells.map((cell, index) => {
            if (cell == null) {
              return <View key={`blank-${index}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
            }
            const dayTasks = byDay.get(dateKey(cell)) ?? [];
            const open = dayTasks.filter((task) => task.status !== "done");
            const selected = cell === selectedDay;
            const isToday = cell === today;
            const overdue = cell < today && open.length > 0;
            return (
              <Pressable
                key={cell}
                accessibilityRole="button"
                accessibilityLabel={`${new Date(cell).toDateString()}, ${dayTasks.length} tasks`}
                accessibilityState={{ selected }}
                onPress={() => setSelectedDay(cell)}
                style={{ width: `${100 / 7}%`, height: 46 }}
                className="items-center justify-center"
              >
                <View
                  className={cn(
                    "h-9 w-9 items-center justify-center rounded-full",
                    selected
                      ? "bg-primary"
                      : isToday
                        ? "border border-primary/60"
                        : "",
                  )}
                >
                  <Text
                    className={cn(
                      "text-[13px] tabular-nums",
                      selected
                        ? "font-semibold text-primary-foreground"
                        : isToday
                          ? "font-semibold text-primary"
                          : "text-foreground",
                    )}
                  >
                    {new Date(cell).getDate()}
                  </Text>
                </View>
                {dayTasks.length > 0 ? (
                  <View className="absolute bottom-0.5 flex-row gap-0.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <View
                        key={task._id}
                        className={cn(
                          "h-1 w-1 rounded-full",
                          task.status === "done"
                            ? "bg-muted-foreground/40"
                            : overdue
                              ? "bg-destructive"
                              : "bg-primary",
                        )}
                      />
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="mb-2 text-[12.5px] font-semibold text-foreground">
          {selectedDay === today ? "Today" : dateLabel(dateKey(selectedDay))}
        </Text>
        {selectedTasks.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-foreground/15 px-5 py-8">
            <Text className="text-[12.5px] text-muted-foreground">Nothing due this day.</Text>
          </View>
        ) : (
          <View className="gap-2">
            {selectedTasks.map((task) => {
              const done = task.status === "done";
              return (
                <Pressable
                  key={task._id}
                  onPress={() => onEdit(task)}
                  className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-foreground/8 bg-card px-3.5 py-2.5 active:opacity-90"
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={done ? "Mark incomplete" : "Mark complete"}
                    hitSlop={8}
                    onPress={(event) => {
                      event.stopPropagation();
                      onToggle(task);
                    }}
                    className={cn(
                      "h-5 w-5 items-center justify-center rounded-full border",
                      done ? "border-primary bg-primary" : "border-foreground/25",
                    )}
                  >
                    {done ? (
                      <Icon as={Check} size={11} strokeWidth={3} className="text-primary-foreground" />
                    ) : null}
                  </Pressable>
                  <View className="flex-1">
                    <Text
                      className={cn(
                        "text-[13.5px] font-medium",
                        done ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {task.title}
                    </Text>
                    <Text className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(task.dueDate!).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {undated > 0 ? (
          <Text className="mt-3 text-[11.5px] text-muted-foreground">
            {undated} open task{undated === 1 ? "" : "s"} without a date. Find
            {undated === 1 ? " it" : " them"} in List.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type TaskDraft = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: number | null;
  reminderMinutesBefore: number | null;
  recurrenceRule: string | null;
  isAgentTask: boolean;
  aiInstruction: string;
};

function TaskComposer({
  visible,
  task,
  onClose,
  onSave,
}: {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}) {
  if (!visible) return null;
  return (
    <TaskComposerForm
      key={task?._id ?? "new"}
      task={task}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function TaskComposerForm({
  task,
  onClose,
  onSave,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}) {
  const { primary, isDark, mutedForeground, primaryForeground } = useTheme();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [dueDate, setDueDate] = useState<number | null>(task?.dueDate ?? null);
  const [reminder, setReminder] = useState<number | null>(
    task?.reminderMinutesBefore ?? null,
  );
  const [recurrence, setRecurrence] = useState<string | null>(
    task?.recurrenceRule ?? null,
  );
  const [isAgentTask, setIsAgentTask] = useState(task?.isAgentTask ?? false);
  const [aiInstruction, setAiInstruction] = useState(task?.aiInstruction ?? "");
  const [picker, setPicker] = useState<"date" | "time" | "reminder" | null>(null);
  // Web ReminderField's "Custom time…": tracked explicitly because a custom
  // pick of exactly 60 min collides with the "1 hour before" preset.
  const [customReminder, setCustomReminder] = useState(
    () =>
      task?.reminderMinutesBefore != null &&
      !PRESET_REMINDERS.includes(task.reminderMinutesBefore),
  );
  const [saving, setSaving] = useState(false);
  const [defaultDueDate] = useState(() => Date.now() + 60 * 60 * 1000);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    if (isAgentTask && dueDate == null) {
      toast.error("Schedule required", {
        description: "Choose a date and time for K-AI to run this task.",
      });
      return;
    }
    if (isAgentTask && !aiInstruction.trim()) {
      toast.error("Instruction required", {
        description: "Tell K-AI what it should do.",
      });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: trimmed,
        description: description.trim(),
        priority,
        dueDate,
        reminderMinutesBefore: reminder,
        recurrenceRule: recurrence,
        isAgentTask,
        aiInstruction: aiInstruction.trim(),
      });
      onClose();
    } catch (error) {
      toast.error("Couldn't save task", {
        description: errorMessage(error, "Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const pickerValue = new Date(
    picker === "reminder" && dueDate != null && reminder != null
      ? dueDate - reminder * 60_000
      : (dueDate ?? defaultDueDate),
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end bg-black/55"
      >
        <View className="max-h-[92%] rounded-t-[28px] border-t border-foreground/10 bg-popover">
          <View className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                Task
              </Text>
              <Text className="mt-1 text-[20px] font-semibold text-foreground">
                {task ? "Edit task" : "Create task"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task editor"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-5 px-5 pb-10 pt-5"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-2">
              <Text className="text-[12px] font-medium text-muted-foreground">
                Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                autoFocus
                maxLength={200}
                placeholder="What needs to happen?"
                placeholderTextColor={mutedForeground}
                className="min-h-12 rounded-xl border border-foreground/5 bg-foreground/4 px-3.5 text-[15px] text-foreground"
              />
            </View>

            <View className="gap-2">
              <Text className="text-[12px] font-medium text-muted-foreground">
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={2000}
                placeholder="Add context (optional)"
                placeholderTextColor={mutedForeground}
                className="min-h-24 rounded-xl border border-foreground/5 bg-foreground/4 px-3.5 py-3 text-[14px] leading-5 text-foreground"
              />
            </View>

            <OptionGroup label="Priority">
              {PRIORITIES.map((option) => (
                <ChoiceChip
                  key={option}
                  label={PRIORITY_META[option].label}
                  selected={priority === option}
                  onPress={() => setPriority(option)}
                />
              ))}
            </OptionGroup>

            <View>
              <Text className="mb-2 text-[12px] font-medium text-muted-foreground">
                Schedule
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <ChoiceChip
                  label={
                    dueDate
                      ? new Date(dueDate).toLocaleDateString()
                      : "Add date"
                  }
                  selected={dueDate != null}
                  icon={CalendarDays}
                  onPress={() => setPicker("date")}
                />
                {dueDate != null ? (
                  <>
                    <ChoiceChip
                      label={new Date(dueDate).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      selected
                      icon={CalendarClock}
                      onPress={() => setPicker("time")}
                    />
                    <ChoiceChip
                      label="Clear"
                      selected={false}
                      onPress={() => {
                        setDueDate(null);
                        setReminder(null);
                        setCustomReminder(false);
                      }}
                    />
                  </>
                ) : null}
              </View>
              {picker ? (
                <View className="mt-3 overflow-hidden rounded-xl border border-foreground/5 bg-foreground/4 p-2">
                  <ExpoDateTimePicker
                    value={pickerValue}
                    mode={picker === "reminder" ? "time" : picker}
                    display="default"
                    accentColor={primary}
                    themeVariant={isDark ? "dark" : "light"}
                    minimumDate={picker === "date" ? new Date(defaultDueDate - 60 * 60 * 1000) : undefined}
                    onChange={(event, selected) => {
                      if (event.type === "dismissed") {
                        setPicker(null);
                        return;
                      }
                      if (selected && picker === "reminder" && dueDate != null) {
                        // Reminder moment on the due day → minutes before due.
                        const due = new Date(dueDate);
                        const at = new Date(due);
                        at.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                        setReminder(
                          Math.max(0, Math.round((due.getTime() - at.getTime()) / 60_000)),
                        );
                      } else if (selected) {
                        setDueDate(selected.getTime());
                      }
                      if (Platform.OS === "android") setPicker(null);
                    }}
                  />
                </View>
              ) : null}
            </View>

            {dueDate != null ? (
              <>
                <OptionGroup label="Reminder">
                  {REMINDER_OPTIONS.map((option) => (
                    <ChoiceChip
                      key={option.label}
                      label={option.label}
                      selected={!customReminder && reminder === option.value}
                      onPress={() => {
                        setCustomReminder(false);
                        setReminder(option.value);
                      }}
                    />
                  ))}
                  <ChoiceChip
                    label={
                      customReminder && reminder != null
                        ? `At ${new Date(dueDate - reminder * 60_000).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : "Custom time…"
                    }
                    selected={customReminder}
                    icon={Bell}
                    onPress={() => {
                      setCustomReminder(true);
                      if (reminder == null) setReminder(30);
                      setPicker("reminder");
                    }}
                  />
                </OptionGroup>
                <OptionGroup label="Repeat">
                  {RECURRENCE_OPTIONS.map((option) => (
                    <ChoiceChip
                      key={option.label}
                      label={option.label}
                      selected={recurrence === option.value}
                      onPress={() => setRecurrence(option.value)}
                    />
                  ))}
                </OptionGroup>
              </>
            ) : null}

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isAgentTask }}
              onPress={() => setIsAgentTask((current) => !current)}
              className={cn(
                "min-h-14 flex-row items-center gap-3 rounded-2xl border px-3.5 py-3",
                isAgentTask
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/12">
                <Icon as={Bot} size={18} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-semibold text-foreground">
                  Run with K-AI
                </Text>
                <Text className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">
                  K-AI performs an instruction at the scheduled time.
                </Text>
              </View>
              <View
                className={cn(
                  "h-6 w-6 items-center justify-center rounded-full border",
                  isAgentTask
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40",
                )}
              >
                {isAgentTask ? (
                  <Icon
                    as={Check}
                    size={13}
                    className="text-primary-foreground"
                  />
                ) : null}
              </View>
            </Pressable>

            {isAgentTask ? (
              <View className="gap-2">
                <Text className="text-[12px] font-medium text-muted-foreground">
                  K-AI instruction
                </Text>
                <TextInput
                  value={aiInstruction}
                  onChangeText={setAiInstruction}
                  multiline
                  maxLength={2000}
                  placeholder="Example: Summarize today's AI news and notify me"
                  placeholderTextColor={mutedForeground}
                  className="min-h-24 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3 text-[14px] leading-5 text-foreground"
                />
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!title.trim() || saving}
              onPress={() => void submit()}
              className={cn(
                "min-h-12 flex-row items-center justify-center gap-2 rounded-xl",
                title.trim() && !saving
                  ? "bg-primary active:opacity-90"
                  : "bg-primary/35",
              )}
            >
              {saving ? (
                <ActivityIndicator size="small" color={primaryForeground} />
              ) : (
                <Icon
                  as={task ? Pencil : Plus}
                  size={17}
                  className="text-primary-foreground"
                />
              )}
              <Text className="text-[14px] font-semibold text-primary-foreground">
                {saving ? "Saving…" : task ? "Save changes" : "Create task"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function OptionGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="mb-2 text-[12px] font-medium text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: typeof Flag;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "min-h-11 flex-row items-center gap-1.5 rounded-xl border px-3.5",
        selected
          ? "border-primary/45 bg-primary/10"
          : "border-border bg-secondary active:bg-accent",
      )}
    >
      {icon ? (
        <Icon
          as={icon}
          size={14}
          className={selected ? "text-primary" : "text-muted-foreground"}
        />
      ) : null}
      <Text
        className={cn(
          "text-[12px] font-medium",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
