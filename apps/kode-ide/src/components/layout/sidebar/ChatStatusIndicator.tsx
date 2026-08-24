import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Option,
  Options,
  OptionsList,
  OptionsPrompt,
} from "@/components/ai-elements/options";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import type { KodeToolStep } from "@/lib/kode-agent";
import { Loader2, MessageSquare, Pin } from "lucide-react";

type OptionItemArg = { value: string; label: string; description?: string };

// Inline answer surface for one pending question, mirroring the in-chat control
// so the user can confirm / pick options without leaving the project they're in.
function PendingAnswer({ step }: { step: KodeToolStep }) {
  const { resolveApproval, resolveOptions } = useKodeAgentRuntime();

  if (step.state === "pending-options") {
    const question =
      typeof step.args.question === "string"
        ? step.args.question
        : step.description;
    const rawOptions = Array.isArray(step.args.options)
      ? (step.args.options as OptionItemArg[])
      : [];
    const multiple = Boolean(step.args.multiple);

    return (
      <Options
        className="border-0 p-0"
        multiple={multiple}
        onSubmit={(values) => resolveOptions(step.id, values)}
      >
        <OptionsPrompt className="text-[13px]">{question}</OptionsPrompt>
        <OptionsList>
          {rawOptions.map((opt) => (
            <Option key={opt.value} value={opt.value} description={opt.description}>
              {opt.label}
            </Option>
          ))}
        </OptionsList>
      </Options>
    );
  }

  // pending-approval — a confirm.
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] font-medium text-foreground">
        {step.description}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => resolveApproval(step.id, true)}
          className="flex-1 rounded-md bg-white px-3 py-1.5 text-[12.5px] font-semibold text-black transition-opacity hover:opacity-90"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => resolveApproval(step.id, false)}
          className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-foreground/65 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

/**
 * Leading icon for a sidebar chat row that reflects that chat's agent state.
 */
export function ChatStatusIndicator({
  chatId,
  isPinned,
}: {
  chatId: string;
  isPinned: boolean;
}) {
  const { statusByChat, pendingByChat } = useKodeAgentRuntime();
  const status = statusByChat[chatId] ?? "idle";

  if (status === "running") {
    return <Loader2 size={13} className="shrink-0 animate-spin text-white" />;
  }

  if (status === "awaiting") {
    const pending = pendingByChat[chatId] ?? [];
    const step = pending[0];
    return (
      <HoverCard openDelay={80} closeDelay={120}>
        <HoverCardTrigger asChild>
          <span
            className="flex size-[15px] shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold leading-none text-white ring-1 ring-white/40"
            aria-label="Needs your reply"
          >
            ?
          </span>
        </HoverCardTrigger>
        {step ? (
          <HoverCardContent
            side="right"
            align="start"
            className="w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <PendingAnswer step={step} />
          </HoverCardContent>
        ) : null}
      </HoverCard>
    );
  }

  if (isPinned) {
    return (
      <Pin size={12} className="shrink-0 text-white" fill="currentColor" />
    );
  }

  return (
    <MessageSquare
      size={13}
      className="shrink-0 text-foreground/35 group-hover/chat:text-foreground/75"
    />
  );
}
