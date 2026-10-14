import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import { Loader2 } from "lucide-react";

/**
 * Aggregate run state for a project, shown next to the folder name so the user
 * notices a chat needs them even when the project is collapsed. Indicator only —
 * the per-chat row is where you actually answer.
 */
export function ProjectStatusRollup({ chatIds }: { chatIds: string[] }) {
  const { statusByChat } = useKodeAgentRuntime();

  let awaiting = 0;
  let running = 0;
  for (const id of chatIds) {
    const status = statusByChat[id];
    if (status === "awaiting") awaiting += 1;
    else if (status === "running") running += 1;
  }

  if (awaiting > 0) {
    return (
      <span
        className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold leading-none text-brand ring-1 ring-brand/40"
        title={`${awaiting} chat${awaiting > 1 ? "s" : ""} need your reply`}
        aria-label={`${awaiting} chats need your reply`}
      >
        ?
      </span>
    );
  }

  if (running > 0) {
    return (
      <Loader2
        size={12}
        className="shrink-0 animate-spin text-brand"
        aria-label="Working"
      />
    );
  }

  return null;
}
