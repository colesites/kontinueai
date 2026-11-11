// Tasks: the same tasks as the web and mobile apps (convex/tasks.ts), laid
// out for a desktop window. A list, board or calendar on the left, the
// selected task's details on the right, and a quick-add line that takes
// focus with N.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Bell, BellOff, CalendarDays, Columns3, List, ListChecks, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { Keys, PillButton, Segmented } from "@/components/settings/settings-ui";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { type NewTask, TaskComposer, type TaskComposerHandle } from "@/components/tasks/TaskComposer";
import { type TaskChange, TaskInspector } from "@/components/tasks/TaskInspector";
import { TaskList } from "@/components/tasks/TaskList";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { tasksApi } from "@/lib/convex-api";
import { groupByBucket, matchesQuery, type Task, taskSnapshot, type TaskStatus, type TaskViewMode } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const VIEW_KEY = "kontinue.tasks.view";
const UNDO_MS = 6_000;

const VIEW_OPTIONS: { value: TaskViewMode; label: string; icon: React.ReactNode }[] = [
  { value: "list", label: "List", icon: <List size={13} /> },
  { value: "board", label: "Board", icon: <Columns3 size={13} /> },
  { value: "calendar", label: "Calendar", icon: <CalendarDays size={13} /> },
];

const CONTENT_WIDTH: Record<TaskViewMode, string> = {
  list: "max-w-[720px]",
  board: "max-w-[1080px]",
  calendar: "max-w-[1180px]",
};

function loadView(): TaskViewMode {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "board" || saved === "calendar" ? saved : "list";
  } catch {
    return "list";
  }
}

function errorText(cause: unknown, fallback: string): string {
  // ConvexError carries the readable message in `data`.
  const data = (cause as { data?: { message?: string } } | null)?.data;
  if (data?.message) return data.message;
  return fallback;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export default function TasksView() {
  const { state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const isFullscreen = useIsFullscreen();
  const { taskReminders } = useAppSettings();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const tasks = useQuery(tasksApi.tasks.listTasks, {});
  const createTask = useMutation(tasksApi.tasks.createTask);
  // The list re-renders from the local store first, so a click answers at once
  // and the server result replaces it a moment later.
  const toggleTask = useMutation(tasksApi.tasks.toggleTaskComplete).withOptimisticUpdate((store, { taskId }) => {
    const list = store.getQuery(tasksApi.tasks.listTasks, {});
    if (!list) return;
    store.setQuery(
      tasksApi.tasks.listTasks,
      {},
      list.map((task) =>
        task._id === taskId
          ? {
              ...task,
              status: task.status === "done" ? ("todo" as const) : ("done" as const),
              completedAt: task.status === "done" ? undefined : Date.now(),
            }
          : task,
      ),
    );
  });
  const updateTask = useMutation(tasksApi.tasks.updateTask).withOptimisticUpdate((store, { taskId, ...patch }) => {
    const list = store.getQuery(tasksApi.tasks.listTasks, {});
    if (!list) return;
    store.setQuery(
      tasksApi.tasks.listTasks,
      {},
      list.map((task) => {
        if (task._id !== taskId) return task;
        const next: Record<string, unknown> = { ...task };
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) next[key] = value === null ? undefined : value;
        }
        if (patch.status) next.completedAt = patch.status === "done" ? (task.completedAt ?? Date.now()) : undefined;
        return next as Task;
      }),
    );
  });
  const deleteTask = useMutation(tasksApi.tasks.deleteTask).withOptimisticUpdate((store, { taskId }) => {
    const list = store.getQuery(tasksApi.tasks.listTasks, {});
    if (list) store.setQuery(tasksApi.tasks.listTasks, {}, list.filter((task) => task._id !== taskId));
  });

  const [view, setView] = useState<TaskViewMode>(loadView);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ title: string; restore: () => void } | null>(null);
  const composerRef = useRef<TaskComposerHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const changeView = (next: TaskViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The choice still holds for this session.
    }
  };

  const visible = useMemo(() => (tasks ?? []).filter((task) => matchesQuery(task, query)), [tasks, query]);
  const groups = useMemo(() => groupByBucket(visible), [visible]);
  const selected = useMemo(() => tasks?.find((task) => task._id === selectedId) ?? null, [tasks, selectedId]);

  const openCount = (tasks ?? []).filter((task) => task.status !== "done").length;
  const overdueCount = useMemo(() => groupByBucket(tasks ?? []).overdue.length, [tasks]);

  // The open task went away (deleted here or on another device).
  useEffect(() => {
    if (selectedId && tasks && !selected) setSelectedId(null);
  }, [selectedId, tasks, selected]);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const run = useCallback(async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
      setProblem(null);
    } catch (cause) {
      setProblem(errorText(cause, fallback));
    }
  }, []);

  const handleCreate = async (task: NewTask) => {
    try {
      await createTask(task);
      setProblem(null);
    } catch (cause) {
      // The composer shows this next to the field and keeps what was typed.
      throw new Error(errorText(cause, "The task could not be added."));
    }
  };

  const handleToggle = (task: Task) => void run(() => toggleTask({ taskId: task._id }), "The task could not be updated.");

  const handleChange = (task: Task, change: TaskChange) =>
    void run(() => updateTask({ taskId: task._id, ...change }), "The change could not be saved.");

  const handleDelete = (task: Task) => {
    const snapshot = taskSnapshot(task);
    void run(() => deleteTask({ taskId: task._id }), "The task could not be deleted.");
    window.clearTimeout(undoTimer.current);
    setUndo({
      title: task.title,
      restore: () => {
        setUndo(null);
        void run(() => createTask(snapshot), "The task could not be restored.");
      },
    });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  // Screen shortcuts: N new task, / search, Esc close details, ⌘Z undo delete.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // An open dialog, menu or popover owns the keyboard.
      if (document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && undo && !isTyping(event.target)) {
        event.preventDefault();
        undo.restore();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        composerRef.current?.focus();
      } else if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, undo]);

  const loading = tasks === undefined || (authLoading && tasks.length === 0);
  const empty = !loading && (tasks?.length ?? 0) === 0;
  const noMatches = !loading && !empty && visible.length === 0;
  const allDone = !loading && !empty && !query && openCount === 0;

  const summary = loading
    ? "Loading"
    : !isAuthenticated
      ? "Sign in to see your tasks"
      : openCount === 0
        ? "Nothing open"
        : `${openCount} open${overdueCount ? ` · ${overdueCount} overdue` : ""}`;

  return (
    <div className="relative flex h-full w-full bg-transparent text-foreground dark:bg-background">
      {sidebarCollapsed ? <FloatingSidebarButtonGroup /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          className={cn(
            "flex h-13 shrink-0 items-center justify-between gap-4 px-6",
            sidebarCollapsed && (isFullscreen ? "pl-[120px]" : "pl-[214px]"),
          )}
        >
          <div data-tauri-drag-region className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="text-lead font-semibold">Tasks</h1>
            <p className="truncate text-label text-muted-foreground" aria-live="polite">
              {summary}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="kontinue-3d flex h-8 w-[190px] items-center gap-2 rounded-full pr-1.5 pl-3 focus-within:border-[var(--brand)]">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    if (query) setQuery("");
                    else e.currentTarget.blur();
                  }
                }}
                placeholder="Search tasks"
                aria-label="Search tasks"
                className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-muted-foreground/70"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              ) : (
                <Keys keys={["/"]} size="sm" />
              )}
            </div>

            <Segmented<TaskViewMode> value={view} options={VIEW_OPTIONS} onChange={changeView} />

            <button
              type="button"
              aria-pressed={taskReminders}
              aria-label={taskReminders ? "Reminders on this Mac are on" : "Reminders on this Mac are off"}
              title={
                taskReminders
                  ? "Reminders on: this Mac shows a notification when one is due. Click to turn off."
                  : "Reminders off on this Mac. Email and other devices are not affected. Click to turn on."
              }
              onClick={() => updateSettings({ taskReminders: !taskReminders })}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-colors",
                taskReminders
                  ? "kontinue-capsule text-purple-900 dark:text-purple-100"
                  : "kontinue-3d text-muted-foreground hover:text-foreground",
              )}
            >
              {taskReminders ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto flex min-h-full w-full flex-col px-6 pt-3 pb-10", CONTENT_WIDTH[view])}>
            <div className="mx-auto w-full max-w-[720px]">
              <TaskComposer ref={composerRef} onCreate={handleCreate} />
              {problem ? (
                <div
                  role="alert"
                  className="mt-3 flex items-center justify-between gap-3 rounded-[14px] border px-3.5 py-2 text-label"
                  style={{ borderColor: "var(--status-danger)", color: "var(--status-danger)" }}
                >
                  <span>{problem}</span>
                  <button type="button" aria-label="Dismiss" onClick={() => setProblem(null)} className="shrink-0 opacity-80 hover:opacity-100">
                    <X size={13} />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-1 flex-col">
              {loading ? (
                <div aria-busy="true" aria-label="Loading tasks" className="mx-auto flex w-full max-w-[720px] flex-col gap-1">
                  {[72, 54, 63, 41].map((width) => (
                    <div key={width} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="size-[18px] shrink-0 animate-pulse rounded-full bg-foreground/10" />
                      <span className="h-3 animate-pulse rounded-full bg-foreground/10" style={{ width: `${width}%` }} />
                    </div>
                  ))}
                </div>
              ) : empty ? (
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                  <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                    <ListChecks size={20} />
                  </span>
                  <h2 className="text-lead font-semibold">No tasks yet</h2>
                  <p className="mt-1 max-w-[340px] text-body leading-relaxed text-muted-foreground">
                    Add one above. Give it a due date to get a reminder, or let K-AI carry it out for you at that time.
                  </p>
                  <div className="mt-4">
                    <PillButton tone="primary" onClick={() => composerRef.current?.focus()}>
                      New task
                      <span className="opacity-70">N</span>
                    </PillButton>
                  </div>
                </div>
              ) : noMatches ? (
                <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                  <h2 className="text-lead font-semibold">No tasks match "{query.trim()}"</h2>
                  <p className="mt-1 text-body text-muted-foreground">Search looks at titles, notes and K-AI instructions.</p>
                  <div className="mt-4">
                    <PillButton onClick={() => setQuery("")}>Clear search</PillButton>
                  </div>
                </div>
              ) : view === "board" ? (
                <TaskBoard
                  tasks={visible}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggle={handleToggle}
                  onMove={(task, status: TaskStatus) => handleChange(task, { status })}
                />
              ) : view === "calendar" ? (
                <TaskCalendar
                  tasks={visible}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onReschedule={(task, dueDate) => handleChange(task, { dueDate })}
                  onCreateOn={(dueDate) => composerRef.current?.focus(dueDate)}
                />
              ) : (
                <>
                  {allDone ? (
                    <p className="mb-5 px-3 text-body text-muted-foreground">Everything is done. Nothing open right now.</p>
                  ) : null}
                  <TaskList
                    groups={groups}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <TaskInspector
          key={selected._id}
          task={selected}
          onChange={(change) => handleChange(selected, change)}
          onDelete={() => handleDelete(selected)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {undo ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-6">
          <div
            role="status"
            className="liquid-glass-dropdown pointer-events-auto flex h-10 max-w-full items-center gap-3 !rounded-full pr-1.5 pl-4 text-label animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
          >
            <span className="truncate">
              Deleted "<span className="font-medium">{undo.title}</span>"
            </span>
            <button
              type="button"
              onClick={undo.restore}
              className="kontinue-3d flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium text-foreground"
            >
              Undo
              <Keys keys={["⌘", "Z"]} size="sm" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
