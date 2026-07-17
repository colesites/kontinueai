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
import { isPushEnabled, requestPushPermission } from "@/lib/push-notifications";
import { cn } from "@/lib/utils";

type Task = Doc<"tasks">;
type TaskView = "list" | "kanban" | "calendar";
type TaskPriority = Task["priority"];
type TaskStatus = Task["status"];

const VIEWS: { id: TaskView; label: string; icon: typeof List }[] = [
  { id: "list", label: "List", icon: List },
  { id: "kanban", label: "Board", icon: Columns3 },
  { id: "calendar", label: "Dates", icon: CalendarDays },
];

const KANBAN_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "#ef4444" },
  high: { label: "High", color: "#f97316" },
  medium: { label: "Medium", color: "#f59e0b" },
  low: { label: "Low", color: "#9ca3af" },
};

const RECURRENCE_OPTIONS = [
  { value: null, label: "No repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
] as const;

const REMINDER_OPTIONS = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At time" },
  { value: 10, label: "10 min before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
] as const;

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
    void toggleTaskComplete({ taskId: task._id }).catch(() =>
      Alert.alert("Couldn't update task", "Please try again."),
    );
  };

  const handleStatus = (task: Task, status: TaskStatus) => {
    void updateTask({ taskId: task._id, status }).catch(() =>
      Alert.alert("Couldn't move task", "Please try again."),
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
            void deleteTask({ taskId: task._id }).catch(() =>
              Alert.alert("Couldn't delete task", "Please try again."),
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
      Alert.alert(
        enabled ? "Reminders enabled" : "Notifications are off",
        enabled
          ? "Task reminders can now reach this device."
          : "Enable notifications in system settings to receive reminders.",
      );
    } catch (error) {
      Alert.alert(
        "Couldn't enable reminders",
        error instanceof Error ? error.message : "Please try again.",
      );
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

        <View className="mt-4 flex-row gap-1 rounded-xl border border-border bg-secondary p-1">
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
          <KanbanView tasks={tasks} onEdit={openEdit} onStatus={handleStatus} />
        ) : (
          <CalendarView tasks={tasks} onEdit={openEdit} />
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
              color={priority.color}
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
}: {
  icon: typeof Flag;
  label: string;
  color?: string;
}) {
  return (
    <View className="flex-row items-center gap-1">
      <Icon
        as={icon}
        size={11}
        color={color}
        className={color ? undefined : "text-muted-foreground"}
      />
      <Text
        className="text-[11px] text-muted-foreground"
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
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
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
            className="rounded-2xl border border-border bg-card p-3"
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
                    className="rounded-xl border border-border bg-secondary/40 p-3 active:bg-accent"
                  >
                    <Text className="text-[13.5px] font-medium text-foreground">
                      {task.title}
                    </Text>
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
      className="min-h-10 flex-row items-center gap-1 rounded-lg border border-border px-3 active:bg-accent"
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

function CalendarView({
  tasks,
  onEdit,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
}) {
  const sections = useMemo(() => {
    const dated = tasks.filter(
      (task) => task.dueDate != null && task.status !== "done",
    );
    const grouped = new Map<string, Task[]>();
    for (const task of dated) {
      const key = dateKey(task.dueDate!);
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  if (sections.length === 0) {
    return (
      <View className="items-center rounded-2xl border border-dashed border-border px-5 py-12">
        <Icon as={CalendarDays} size={22} className="text-muted-foreground" />
        <Text className="mt-3 text-center text-[13px] text-muted-foreground">
          Add a due date to see tasks in the date view.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-5">
      {sections.map(([key, sectionTasks]) => (
        <View key={key}>
          <Text className="mb-2 text-[12px] font-semibold text-foreground">
            {dateLabel(key)}
          </Text>
          <View className="gap-2 border-l-2 border-primary/25 pl-3">
            {sectionTasks.map((task) => (
              <Pressable
                key={task._id}
                onPress={() => onEdit(task)}
                className="min-h-14 justify-center rounded-xl border border-border bg-card px-3.5 py-2.5 active:bg-accent"
              >
                <Text className="text-[13.5px] font-medium text-foreground">
                  {task.title}
                </Text>
                <Text className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(task.dueDate!).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
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
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [saving, setSaving] = useState(false);
  const [defaultDueDate] = useState(() => Date.now() + 60 * 60 * 1000);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    if (isAgentTask && dueDate == null) {
      Alert.alert(
        "Schedule required",
        "Choose a date and time for K-AI to run this task.",
      );
      return;
    }
    if (isAgentTask && !aiInstruction.trim()) {
      Alert.alert("Instruction required", "Tell K-AI what it should do.");
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
      const data = (error as { data?: { message?: string } })?.data;
      Alert.alert(
        "Couldn't save task",
        data?.message ??
          (error instanceof Error ? error.message : "Please try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  const pickerValue = new Date(dueDate ?? defaultDueDate);

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
        <View className="max-h-[92%] rounded-t-3xl border-t border-border bg-background">
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
              className="h-11 w-11 items-center justify-center rounded-xl bg-secondary active:bg-accent"
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
                className="min-h-12 rounded-xl border border-border bg-secondary px-3.5 text-[15px] text-foreground"
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
                className="min-h-24 rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] leading-5 text-foreground"
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
                      }}
                    />
                  </>
                ) : null}
              </View>
              {picker ? (
                <View className="mt-3 overflow-hidden rounded-xl border border-border bg-secondary p-2">
                  <ExpoDateTimePicker
                    value={pickerValue}
                    mode={picker}
                    display="default"
                    accentColor={primary}
                    themeVariant={isDark ? "dark" : "light"}
                    minimumDate={picker === "date" ? new Date() : undefined}
                    onChange={(event, selected) => {
                      if (event.type === "dismissed") {
                        setPicker(null);
                        return;
                      }
                      if (selected) setDueDate(selected.getTime());
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
                      selected={reminder === option.value}
                      onPress={() => setReminder(option.value)}
                    />
                  ))}
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
