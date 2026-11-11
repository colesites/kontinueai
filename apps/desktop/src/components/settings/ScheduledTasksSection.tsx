// Settings → Scheduled tasks: prompts queued to send into a Kode chat later
// (kode-schedule.ts). Limit resets and Auto-fix queue them on their own; you
// can add one here too. A due prompt sends when its chat is open, or Kode
// opens the chat once you've stepped away.

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Plus, Send, X } from "lucide-react";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { getSettings } from "@/lib/app-settings";
import { formatCountdown, formatResetTime } from "@/lib/kode-limits";
import { getChatModel } from "@/lib/kode-pr-watch";
import {
  removeScheduledPrompt,
  reschedulePrompt,
  schedulePrompt,
  useScheduledPrompts,
  type ScheduledPrompt,
} from "@/lib/kode-schedule";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useMutation, useQuery } from "convex/react";
import { tasksApi } from "@/lib/convex-api";
import { Card, Empty, LinkButton, PillButton, Select, Tag, TextField } from "./settings-ui";

const HOUR = 3_600_000;

const REASON: Record<ScheduledPrompt["reason"], { label: string; tone: "purple" | "amber" | "green" }> = {
  manual: { label: "Scheduled", tone: "purple" },
  limit: { label: "After limit reset", tone: "amber" },
  pr: { label: "Auto-fix", tone: "green" },
};

/** yyyy-MM-ddTHH:mm in local time, for <input type="datetime-local">. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduledTasksSection({ onClose }: { onClose: () => void }) {
  const items = useScheduledPrompts();
  const { kodeChats, setActiveTab, selectChat } = useKodeWorkspace();
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const titleFor = (item: ScheduledPrompt) =>
    kodeChats.find((chat) => chat.id === item.chatId)?.title ?? item.chatTitle ?? "Untitled chat";

  const openChat = (chatId: string) => {
    onClose();
    setActiveTab("kode");
    selectChat(chatId);
  };

  return (
    <>
      <Card
        title="Kode tasks"
        action={
          !adding ? (
            <LinkButton onClick={() => setAdding(true)}>
              <Plus size={12} />
              New task
            </LinkButton>
          ) : null
        }
      >
        {adding ? <NewTaskForm onDone={() => setAdding(false)} /> : null}
        {items.length === 0 && !adding ? (
          <Empty title="No scheduled tasks">
            Queue a prompt from a usage-limit card, turn on Auto-fix for a PR, or add one here.
          </Empty>
        ) : null}
        {items.map((item) => {
          const due = item.fireAt <= now;
          const reason = REASON[item.reason];
          return (
            <div key={item.id} className="flex items-start gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-body font-medium text-foreground/90">
                  <span className="truncate">{titleFor(item)}</span>
                  <Tag tone={reason.tone}>{reason.label}</Tag>
                </p>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-label leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
                <p className="mt-1 text-caption text-muted-foreground/80">
                  {due ? "Due now. Sends when the chat is open." : `${formatResetTime(item.fireAt, now)} · ${formatCountdown(item.fireAt, now)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <PillButton onClick={() => openChat(item.chatId)} title="Open the chat">
                  <ArrowUpRight size={12} />
                  Open
                </PillButton>
                {!due ? (
                  <PillButton onClick={() => reschedulePrompt(item.id, Date.now())} title="Send it the next time the chat is open">
                    <Send size={12} />
                    Now
                  </PillButton>
                ) : null}
                <button
                  type="button"
                  aria-label="Cancel task"
                  title="Cancel"
                  onClick={() => removeScheduledPrompt(item.id)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-rose-500"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </Card>
      <p className="-mt-5 mb-8 px-1 text-caption leading-relaxed text-muted-foreground">
        Kode tasks are kept on this Mac and only send while Kontinue is open. When one is due, it sends in its chat if
        that chat is open; otherwise Kode opens the chat once you've been away for a bit.
      </p>

      <KontinueTasksCard
        now={now}
        onOpenTasks={() => {
          onClose();
          setActiveTab("tasks");
        }}
      />
    </>
  );
}

const PRIORITY_TONE = { low: "neutral", medium: "neutral", high: "amber", urgent: "red" } as const;

/** Tasks from Kontinue (web, mobile, K-AI): synced, run on the server. */
function KontinueTasksCard({ now, onOpenTasks }: { now: number; onOpenTasks: () => void }) {
  const tasks = useQuery(tasksApi.tasks.listTasks, {});
  const toggle = useMutation(tasksApi.tasks.toggleTaskComplete);
  const open = (tasks ?? []).filter((task) => task.status !== "done").slice(0, 30);

  return (
    <>
      <Card
        title={`Kontinue tasks${open.length ? ` (${open.length})` : ""}`}
        action={
          <LinkButton onClick={onOpenTasks}>
            <ArrowUpRight size={12} />
            Open Tasks
          </LinkButton>
        }
      >
        {tasks === undefined ? (
          <Empty title="Loading…" />
        ) : open.length === 0 ? (
          <Empty title="No open tasks">Add tasks and reminders in Tasks. Ones K-AI creates show up here too.</Empty>
        ) : (
          open.map((task) => (
            <div key={task._id} className="flex items-start gap-3 px-5 py-3">
              <button
                type="button"
                aria-label={`Mark ${task.title} done`}
                title="Mark done"
                onClick={() => void toggle({ taskId: task._id })}
                className="mt-0.5 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/25 transition-colors hover:border-purple-500 hover:bg-purple-500/10 dark:border-white/25"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-body font-medium text-foreground/90">
                  <span className="truncate">{task.title}</span>
                  {task.isAgentTask ? <Tag tone="purple">K-AI runs it</Tag> : null}
                  {task.priority === "high" || task.priority === "urgent" ? (
                    <Tag tone={PRIORITY_TONE[task.priority]}>{task.priority === "urgent" ? "Urgent" : "High"}</Tag>
                  ) : null}
                  {task.recurring ? <Tag>Repeats</Tag> : null}
                </p>
                {task.isAgentTask && task.aiInstruction ? (
                  <p className="mt-0.5 line-clamp-1 text-label text-muted-foreground">{task.aiInstruction}</p>
                ) : task.description ? (
                  <p className="mt-0.5 line-clamp-1 text-label text-muted-foreground">{task.description}</p>
                ) : null}
                <p className="mt-0.5 text-caption text-muted-foreground/80">
                  {task.dueDate
                    ? task.dueDate < now
                      ? `Overdue · ${new Date(task.dueDate).toLocaleString()}`
                      : `${formatResetTime(task.dueDate, now)} · ${formatCountdown(task.dueDate, now)}`
                    : "No due date"}
                </p>
              </div>
            </div>
          ))
        )}
      </Card>
      <p className="-mt-5 px-1 text-caption leading-relaxed text-muted-foreground">
        Kontinue tasks sync with your account and run on our servers, so reminders and K-AI tasks go out even when
        this Mac is off. Kode tasks above need this app open because they run on your machine.
      </p>
    </>
  );
}

function NewTaskForm({ onDone }: { onDone: () => void }) {
  const { kodeChats } = useKodeWorkspace();
  const chats = useMemo(
    () => kodeChats.filter((chat) => !chat.archived).sort((a, b) => b.updatedAt - a.updatedAt),
    [kodeChats],
  );
  const [chatId, setChatId] = useState(chats[0]?.id ?? "");
  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(Date.now() + HOUR));

  const fireAt = new Date(when).getTime();
  const valid = !!chatId && !!text.trim() && Number.isFinite(fireAt);

  const save = () => {
    if (!valid) return;
    const settings = getSettings();
    const chat = chats.find((c) => c.id === chatId);
    schedulePrompt({
      chatId,
      chatTitle: chat?.title ?? null,
      text: text.trim(),
      modelId: getChatModel(chatId) ?? settings.defaultKodeModel ?? KODE_MODEL_ID,
      mode: settings.defaultKodeMode,
      fireAt: Math.max(fireAt, Date.now()),
      reason: "manual",
    });
    onDone();
  };

  const presets = [
    { label: "In 1 hour", at: Date.now() + HOUR },
    { label: "In 3 hours", at: Date.now() + 3 * HOUR },
    {
      label: "Tomorrow 9 AM",
      at: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      })(),
    },
  ];

  if (chats.length === 0) {
    return (
      <Empty title="No Kode chats yet">
        Start a Kode chat first; a task sends into an existing chat.{" "}
        <button type="button" className="cursor-pointer underline" onClick={onDone}>
          Close
        </button>
      </Empty>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-label text-muted-foreground">Chat</span>
        <Select
          value={chatId}
          minWidth={260}
          options={chats.slice(0, 50).map((chat) => ({ value: chat.id, label: chat.title || "Untitled chat" }))}
          onChange={setChatId}
        />
      </div>
      <div className="flex gap-2">
        <span className="w-16 pt-2 text-label text-muted-foreground">Prompt</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="What should the agent do?"
          className="kontinue-3d min-w-0 flex-1 resize-none rounded-2xl bg-transparent px-3.5 py-2 text-body outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-label text-muted-foreground">When</span>
        <TextField type="datetime-local" value={when} onChange={setWhen} min={toLocalInput(Date.now())} />
        {presets.map((preset) => (
          <LinkButton key={preset.label} onClick={() => setWhen(toLocalInput(preset.at))}>
            {preset.label}
          </LinkButton>
        ))}
      </div>
      <div className="flex justify-end gap-1.5">
        <PillButton onClick={onDone}>Cancel</PillButton>
        <PillButton tone="primary" onClick={save} disabled={!valid}>
          Schedule
        </PillButton>
      </div>
    </div>
  );
}
