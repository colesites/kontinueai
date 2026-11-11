// Quick add. One line by default; focusing it reveals the due date, priority,
// reminder, repeat and K-AI options. Enter adds the task and keeps focus so
// several can be entered in a row.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Bot, Plus } from "lucide-react";
import { Keys } from "@/components/settings/settings-ui";
import { fieldClassName } from "@/components/ui/dialog";
import type { TaskPriority } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { DueDateField, PriorityField, ReminderField, RepeatField } from "./TaskFields";

export type NewTask = {
  title: string;
  dueDate?: number;
  priority: TaskPriority;
  reminderMinutesBefore?: number;
  recurring: boolean;
  recurrenceRule?: string;
  isAgentTask: boolean;
  aiInstruction?: string;
};

export type TaskComposerHandle = {
  /** Focus the title; optionally preset the due date (calendar day click). */
  focus: (dueDate?: number) => void;
};

const TITLE_MAX = 200;
const INSTRUCTION_MAX = 2000;

export const TaskComposer = forwardRef<TaskComposerHandle, { onCreate: (task: NewTask) => Promise<void> }>(
  function TaskComposer({ onCreate }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [title, setTitle] = useState("");
    const [due, setDue] = useState<number | null>(null);
    const [priority, setPriority] = useState<TaskPriority>("medium");
    const [reminder, setReminder] = useState<number | null>(null);
    const [repeat, setRepeat] = useState<string | null>(null);
    const [agent, setAgent] = useState(false);
    const [instruction, setInstruction] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      focus: (dueDate) => {
        if (dueDate != null) setDue(dueDate);
        setExpanded(true);
        inputRef.current?.focus();
      },
    }));

    const reset = () => {
      setTitle("");
      setDue(null);
      setPriority("medium");
      setReminder(null);
      setRepeat(null);
      setAgent(false);
      setInstruction("");
      setProblem(null);
    };

    const submit = async () => {
      const trimmed = title.trim();
      if (!trimmed || saving) return;
      if (agent && due == null) {
        setProblem("Pick a date and time for K-AI to run this.");
        return;
      }
      if (agent && !instruction.trim()) {
        setProblem("Tell K-AI what to do for this task.");
        return;
      }
      setSaving(true);
      setProblem(null);
      try {
        await onCreate({
          title: trimmed,
          dueDate: due ?? undefined,
          priority,
          reminderMinutesBefore: due != null ? (reminder ?? undefined) : undefined,
          recurring: repeat != null,
          recurrenceRule: repeat ?? undefined,
          isAgentTask: agent,
          aiInstruction: agent ? instruction.trim() : undefined,
        });
        reset();
        inputRef.current?.focus();
      } catch (cause) {
        setProblem(cause instanceof Error ? cause.message : "The task could not be added.");
      } finally {
        setSaving(false);
      }
    };

    const dirty =
      title.trim() !== "" || due != null || priority !== "medium" || reminder != null || repeat != null || agent;
    const showOptions = expanded || dirty;

    // Fold the options away on a click elsewhere, unless something is filled
    // in. Menus and popovers render outside this element, so they don't count.
    useEffect(() => {
      if (!expanded || dirty) return;
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target as Element | null;
        if (!target || rootRef.current?.contains(target)) return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
        setExpanded(false);
      };
      document.addEventListener("pointerdown", onPointerDown);
      return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [expanded, dirty]);

    return (
      <div
        ref={rootRef}
        className="liquid-glass-composer rounded-[22px]"
        onKeyDown={(event) => {
          // Menus and popovers are portals: their Escape bubbles here through
          // React but belongs to them, so only react to keys from inside.
          if (event.key !== "Escape" || !event.currentTarget.contains(event.target as Node)) return;
          event.stopPropagation();
          // Never throws away what was typed: Escape only steps out.
          (document.activeElement as HTMLElement | null)?.blur();
          if (!dirty) setExpanded(false);
        }}
      >
        <div className="flex h-12 items-center gap-2.5 pr-2 pl-4">
          <Plus size={15} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => {
              setTitle(e.target.value);
              setProblem(null);
            }}
            onFocus={() => setExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Add a task"
            aria-label="New task title"
            className="min-w-0 flex-1 bg-transparent text-lead outline-none placeholder:text-muted-foreground/70"
          />
          {!showOptions ? <Keys keys={["N"]} size="sm" /> : null}
          <button
            type="button"
            aria-label="Add task"
            disabled={!title.trim() || saving}
            onClick={() => void submit()}
            className="kontinue-3d-primary flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={15} />
          </button>
        </div>

        {showOptions ? (
          <div className="border-t border-black/[0.05] px-3 pt-2.5 pb-3 dark:border-white/[0.05]">
            <div className="flex flex-wrap items-center gap-1.5">
              <DueDateField value={due} onChange={setDue} />
              <PriorityField value={priority} onChange={setPriority} />
              <ReminderField value={due == null ? null : reminder} dueDate={due} onChange={setReminder} />
              <RepeatField value={repeat} onChange={setRepeat} />
              <button
                type="button"
                aria-pressed={agent}
                title="K-AI carries out an instruction at the due time and sends you the result"
                onClick={() => {
                  setAgent((v) => !v);
                  setProblem(null);
                }}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-label transition-colors",
                  agent
                    ? "kontinue-capsule font-medium text-purple-900 dark:text-purple-100"
                    : "kontinue-3d text-muted-foreground hover:text-foreground",
                )}
              >
                <Bot size={13} />
                Run with K-AI
              </button>
            </div>

            {agent ? (
              <textarea
                value={instruction}
                maxLength={INSTRUCTION_MAX}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                aria-label="Instruction for K-AI"
                placeholder="What should K-AI do? For example: summarise my unread email and list anything urgent."
                className={fieldClassName("mt-2.5 resize-none py-2 leading-relaxed")}
              />
            ) : null}

            {problem ? (
              <p role="alert" className="mt-2 px-1 text-label" style={{ color: "var(--status-danger)" }}>
                {problem}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
);
