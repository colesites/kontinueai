import { Brain, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import {
  getDefaultKodeModel,
  getKodeModelById,
  kodeContextBudget,
  kodeContextOptions,
  resolveKodeEffort,
  KODE_DEFAULT_CONTEXT,
  type KodeEffort,
} from "@repo/ai/lib/kode";
import { cn } from "@/lib/utils";

const EFFORT_LABEL: Record<KodeEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

const EFFORT_HINT: Record<KodeEffort, string> = {
  low: "Fastest, least thinking",
  medium: "Balanced",
  high: "Thinks carefully",
  xhigh: "Deeper reasoning",
  max: "Most thorough, slowest",
};

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
  return `${Math.round(tokens / 1000)}k`;
}

/**
 * Reasoning effort + context window for the selected Kode model. Options come
 * from the model catalog; choices are saved in app settings and used for every
 * request (effort) and the context meter / auto-compaction (window).
 */
export function KodeReasoningPopover({
  modelId,
  className,
  onReasoningToggle,
  side = "top",
}: {
  modelId?: string;
  className?: string;
  side?: "top" | "bottom";
  /** Kept for callers that track an on/off flag separately. */
  reasoningEnabled?: boolean;
  onReasoningToggle?: (enabled: boolean) => void;
}) {
  const { kodeReasoning, kodeContextWindow } = useAppSettings();
  const model = (modelId && getKodeModelById(modelId)) || getDefaultKodeModel();
  const { efforts, canDisable } = model.reasoning;

  const off = kodeReasoning === "off" && canDisable;
  const effort = off ? null : resolveKodeEffort(model, kodeReasoning === "off" ? "high" : kodeReasoning);
  const contextOptions = kodeContextOptions(model);
  const contextBudget = kodeContextBudget(model, kodeContextWindow);

  const label = off
    ? `Thinking off · ${formatContext(contextBudget)}`
    : `${effort ? EFFORT_LABEL[effort] : "Thinking"} · ${formatContext(contextBudget)}`;

  const chooseEffort = (next: KodeEffort | "off") => {
    updateSettings({ kodeReasoning: next });
    onReasoningToggle?.(next !== "off");
  };

  const rowClass = "flex w-full items-center gap-2.5 px-3 py-1.5";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Reasoning and context: ${label}`}
          className={cn(
            "flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
            off
              ? "liquid-glass-pill text-zinc-700 hover:text-zinc-950 dark:text-foreground/70 dark:hover:text-foreground"
              : "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100",
            className,
          )}
        >
          <Brain size={13} className={off ? "text-muted-foreground" : "text-purple-600 dark:text-purple-300"} />
          <span>{label}</span>
          <ChevronDown size={11} className="ml-0.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side={side} sideOffset={8} className="w-60 p-1.5 select-none">
        <p className="px-3 pt-1 pb-1 text-caption font-medium text-muted-foreground/70">
          Reasoning · {model.name}
        </p>
        {efforts.length === 0 ? (
          <p className="px-3 pb-1.5 text-label text-muted-foreground">
            This model decides how much to think on its own.
          </p>
        ) : (
          efforts.map((level) => (
            <DropdownMenuItem key={level} onSelect={() => chooseEffort(level)} className={rowClass}>
              <span className="min-w-0 flex-1">
                <span className="block text-body">{EFFORT_LABEL[level]}</span>
                <span className="block text-caption text-muted-foreground">{EFFORT_HINT[level]}</span>
              </span>
              {effort === level && !off ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
            </DropdownMenuItem>
          ))
        )}
        {canDisable ? (
          <DropdownMenuItem onSelect={() => chooseEffort("off")} className={rowClass}>
            <span className="min-w-0 flex-1">
              <span className="block text-body">Off</span>
              <span className="block text-caption text-muted-foreground">Answer directly, no thinking</span>
            </span>
            {off ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
          </DropdownMenuItem>
        ) : null}

        <div className="my-1.5 h-px bg-black/[0.06] dark:bg-white/[0.06]" />

        <p className="px-3 pt-1 pb-1 text-caption font-medium text-muted-foreground/70">Context window</p>
        {contextOptions.map((size) => (
          <DropdownMenuItem
            key={size}
            onSelect={() => updateSettings({ kodeContextWindow: size })}
            className={rowClass}
          >
            <span className="flex-1 text-body">{formatContext(size)}</span>
            {size === Math.min(KODE_DEFAULT_CONTEXT, model.contextWindow) ? (
              <span className="text-micro text-muted-foreground">Default</span>
            ) : size === model.contextWindow ? (
              <span className="text-micro text-muted-foreground">Full</span>
            ) : null}
            {size === contextBudget ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
          </DropdownMenuItem>
        ))}
        <p className="px-3 pt-1 pb-1 text-caption leading-relaxed text-muted-foreground">
          Bigger windows keep more history per request and use more of your plan.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default KodeReasoningPopover;
