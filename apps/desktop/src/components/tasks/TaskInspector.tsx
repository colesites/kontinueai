// The detail pane for one task. Every change saves on its own (pickers at
// once, text when you leave the field), so there is no Save button to forget.

import { useEffect, useRef, useState } from "react";
import { Bot, Trash2, X } from "lucide-react";
import { Segmented } from "@/components/settings/settings-ui";
import { fieldClassName } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { STATUS_COLUMNS, type Task, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { DueDateField, PriorityField, ReminderField, RepeatField } from "./TaskFields";

/** Fields the inspector can change; null clears one (see tasks.updateTask). */
export type TaskChange = {
  title?: string;
  description?: string;
  dueDate?: number | null;
  priority?: Task["priority"];
  status?: TaskStatus;
  recurring?: boolean;
  recurrenceRule?: string | null;
  isAgentTask?: boolean;
  aiInstruction?: string | null;
  reminderMinutesBefore?: number | null;
};

const STATUS_OPTIONS = STATUS_COLUMNS.map((column) => ({ value: column.status, label: column.label }));

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Text that follows the task while idle and saves when focus leaves it. */
function useDraft(value: string, taskId: string, onCommit: (next: string) => void) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  // Follow outside changes (another device, a different task) unless typing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId resets the draft on a task switch
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value, taskId]);
  return {
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (draft.trim() !== value.trim()) onCommit(draft);
    },
    reset: () => setDraft(value),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="shrink-0 text-label text-muted-foreground">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

export function TaskInspector({
  task,
  onChange,
  onDelete,
  onClose,
}: {
  task: Task;
  onChange: (change: TaskChange) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const title = useDraft(task.title, task._id, (next) => {
    // A task must keep a title: an empty edit goes back to what it was.
    if (next.trim()) onChange({ title: next.trim() });
  });
  const notes = useDraft(task.description ?? "", task._id, (next) => onChange({ description: next.trim() }));
  const instruction = useDraft(task.aiInstruction ?? "", task._id, (next) =>
    onChange({ aiInstruction: next.trim() || null }),
  );

  // Grow the title with its text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title.value]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different task starts clean
  useEffect(() => setProblem(null), [task._id]);

  const done = task.status === "done";
  const due = task.dueDate ?? null;

  const toggleAgent = (on: boolean) => {
    if (on && due == null) {
      setProblem("Set a due date first: K-AI runs the task at that time.");
      return;
    }
    setProblem(null);
    onChange({ isAgentTask: on });
  };

  return (
    <aside
      aria-label="Task details"
      className="flex h-full w-[340px] shrink-0 flex-col border-l border-[var(--edge)] bg-[var(--surface-1)] animate-in fade-in-0 slide-in-from-right-2 duration-200"
      onKeyDown={(event) => {
        // Escape from a menu or popover (a portal) closes that, not this pane.
        if (event.key === "Escape" && event.currentTarget.contains(event.target as Node)) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex h-13 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
        <span className="text-label font-medium text-muted-foreground">Details</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Delete task"
            title="Delete task"
            onClick={onDelete}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-[var(--status-danger)]"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            aria-label="Close details"
            title="Close (Esc)"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <textarea
          ref={titleRef}
          rows={1}
          maxLength={200}
          aria-label="Task title"
          value={title.value}
          onChange={title.onChange}
          onFocus={title.onFocus}
          onBlur={() => {
            if (!title.value.trim()) title.reset();
            title.onBlur();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "w-full resize-none overflow-hidden bg-transparent text-[16px] leading-snug font-semibold outline-none placeholder:text-muted-foreground/60",
            done && "text-muted-foreground line-through",
          )}
        />

        <div className="mt-3 flex">
          <Segmented<TaskStatus> value={task.status} options={STATUS_OPTIONS} onChange={(status) => onChange({ status })} />
        </div>

        <div className="mt-4 border-t border-[var(--edge)] pt-2">
          <Field label="Due">
            <DueDateField
              value={due}
              align="end"
              placeholder="Add date"
              onChange={(next) =>
                // No due date means nothing to remind about or for K-AI to run at.
                onChange(next == null ? { dueDate: null, reminderMinutesBefore: null } : { dueDate: next })
              }
            />
          </Field>
          <Field label="Reminder">
            <ReminderField
              value={due == null ? null : (task.reminderMinutesBefore ?? null)}
              dueDate={due}
              onChange={(minutes) => onChange({ reminderMinutesBefore: minutes })}
            />
          </Field>
          <Field label="Repeat">
            <RepeatField
              value={task.recurring ? (task.recurrenceRule ?? null) : null}
              onChange={(rule) => onChange({ recurring: rule != null, recurrenceRule: rule })}
            />
          </Field>
          <Field label="Priority">
            <PriorityField value={task.priority} onChange={(priority) => onChange({ priority })} />
          </Field>
        </div>

        <div className="mt-2 border-t border-[var(--edge)] pt-4">
          <label htmlFor="task-notes" className="mb-1.5 block text-label text-muted-foreground">
            Notes
          </label>
          <textarea
            id="task-notes"
            rows={4}
            maxLength={2000}
            value={notes.value}
            onChange={notes.onChange}
            onFocus={notes.onFocus}
            onBlur={notes.onBlur}
            placeholder="Add notes"
            className={fieldClassName("resize-none py-2 leading-relaxed")}
          />
        </div>

        <div className="mt-4 border-t border-[var(--edge)] pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="task-agent" className="flex min-w-0 items-start gap-2">
              <Bot size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />
              <span>
                <span className="block text-body font-medium">Run with K-AI</span>
                <span className="block text-label leading-relaxed text-muted-foreground">
                  K-AI carries out an instruction at the due time and sends you the result.
                </span>
              </span>
            </label>
            <Switch id="task-agent" checked={Boolean(task.isAgentTask)} onCheckedChange={toggleAgent} />
          </div>
          {task.isAgentTask ? (
            <textarea
              rows={3}
              maxLength={2000}
              aria-label="Instruction for K-AI"
              value={instruction.value}
              onChange={instruction.onChange}
              onFocus={instruction.onFocus}
              onBlur={instruction.onBlur}
              placeholder="What should K-AI do?"
              className={fieldClassName("mt-2.5 resize-none py-2 leading-relaxed")}
            />
          ) : null}
          {task.isAgentTask && !instruction.value.trim() ? (
            <p className="mt-1.5 text-label" style={{ color: "var(--status-caution)" }}>
              Without an instruction this stays a normal reminder.
            </p>
          ) : null}
          {problem ? (
            <p role="alert" className="mt-1.5 text-label" style={{ color: "var(--status-danger)" }}>
              {problem}
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-caption text-muted-foreground/80">
          Created {formatStamp(task.createdAt)}
          {task.completedAt ? ` · Completed ${formatStamp(task.completedAt)}` : ""}
        </p>
      </div>
    </aside>
  );
}
