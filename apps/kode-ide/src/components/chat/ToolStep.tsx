import {
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Option,
  Options,
  OptionsList,
  OptionsPrompt,
} from "@/components/ai-elements/options";
import type { KodeToolStep } from "@/lib/kode-agent";

type OptionItemArg = { value: string; label: string; description?: string };

const STATE_ICON: Record<KodeToolStep["state"], React.ReactNode> = {
  "pending-approval": <Clock className="size-3 text-yellow-500" />,
  "pending-options": <Clock className="size-3 text-blue-400" />,
  running: <Loader2 className="size-3 animate-spin text-foreground/50" />,
  done: <CheckCircle2 className="size-3 text-emerald-500" />,
  error: <XCircle className="size-3 text-red-500" />,
  rejected: <XCircle className="size-3 text-foreground/35" />,
};

export function ToolStepView({
  step,
  onApprove,
  onReject,
  onOptions,
}: {
  step: KodeToolStep;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOptions: (id: string, values: string[]) => void;
}) {
  // ask_options elicitation: render the choices inline and submit the selection.
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
        className="my-1.5"
        multiple={multiple}
        onSubmit={(values) => onOptions(step.id, values)}
      >
        <OptionsPrompt>{question}</OptionsPrompt>
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

  // Everything else renders as a lightweight inline text line under the message.
  return (
    <div className="my-0.5 flex flex-col gap-1 text-[12.5px]">
      <div className="flex items-center gap-1.5 text-foreground/55">
        <ChevronRight className="size-3 text-foreground/30" />
        {STATE_ICON[step.state]}
        <span className="text-foreground/70">{step.description}</span>
        {step.state === "pending-approval" ? (
          <span className="ml-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onApprove(step.id)}
              className="text-emerald-400 hover:underline"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onReject(step.id)}
              className="text-foreground/45 hover:underline"
            >
              Reject
            </button>
          </span>
        ) : null}
      </div>

      {step.result &&
      (step.state === "error" || step.state === "rejected") ? (
        <span
          className={cn(
            "ml-[18px] text-[11.5px]",
            step.state === "error" ? "text-red-300/70" : "text-foreground/40",
          )}
        >
          {step.result.length > 200
            ? `${step.result.slice(0, 200)}…`
            : step.result}
        </span>
      ) : null}
    </div>
  );
}
