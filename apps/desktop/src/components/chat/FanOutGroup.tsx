// Kode's own sub-agents (run_subagents, src/lib/kode-fanout.ts) as a
// SubagentGroup: one row per model, live while they work.

import { ModelSelectorLogo } from "@/components/chat/ModelPickerPopover";
import { SubagentGroup, type SubagentItem, type SubagentStatus } from "@/components/chat/SubagentGroup";
import { ToolStepList } from "@/components/chat/ToolStep";
import { stopFanOutRun, useFanOuts, type FanOut, type FanOutRunStatus } from "@/lib/kode-fanout";
import { useKodeWorkspace } from "@/lib/kode-workspace";

const STATUS: Record<FanOutRunStatus, SubagentStatus> = {
  queued: "queued",
  starting: "working",
  running: "working",
  done: "done",
  error: "error",
  stopped: "stopped",
};

export function fanOutItems(fanOut: FanOut, openChat: (chatId: string) => void): SubagentItem[] {
  return fanOut.runs.map((run) => ({
    key: run.id,
    label: run.modelName,
    icon: run.provider ? <ModelSelectorLogo provider={run.provider} className="size-3.5" /> : undefined,
    status: STATUS[run.status],
    detail: run.error ?? (run.preview || undefined),
    meta: run.files ? `${run.files} file${run.files === 1 ? "" : "s"} +${run.additions} −${run.deletions}` : undefined,
    onOpen: run.chatId ? () => openChat(run.chatId!) : undefined,
    onStop: () => stopFanOutRun(run.id),
    // Expanding the row shows what this sub-agent is doing, live.
    children: run.steps.length > 0 ? <ToolStepList steps={run.steps} /> : undefined,
  }));
}

/** The group a `run_subagents` call started, found by its task. Null when it
 *  ran in an earlier session (only the saved result is left then). */
export function FanOutGroup({ task }: { task: string }) {
  const fanOuts = useFanOuts();
  const { selectChat } = useKodeWorkspace();
  const fanOut = fanOuts.find((f) => f.prompt === task.trim());
  if (!fanOut) return null;
  return <SubagentGroup items={fanOutItems(fanOut, selectChat)} startedAt={fanOut.createdAt} />;
}

export function hasFanOut(fanOuts: FanOut[], task: unknown) {
  return typeof task === "string" && fanOuts.some((f) => f.prompt === task.trim());
}
