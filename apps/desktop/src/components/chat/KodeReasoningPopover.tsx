import { Brain, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { kodeContextBudget, resolveKodeEffort, KODE_DEFAULT_CONTEXT, type KodeEffort } from "@repo/ai/lib/kode";
import { getModelControls } from "@/lib/model-controls";
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

/** The effort a model actually runs at for a requested level (null = not adjustable). */
export function effortFor(efforts: KodeEffort[], requested: KodeEffort): KodeEffort | null {
  if (efforts.length === 0) return null;
  return resolveKodeEffort({ reasoning: { efforts, canDisable: false } } as Parameters<typeof resolveKodeEffort>[0], requested);
}

/**
 * Reasoning effort + context window for the selected model, whatever runs it:
 * Kode's models, Claude Code (effort), Codex (effort), or agents that decide
 * themselves (Cursor, ACP), where it only shows the context window.
 *
 * In a chat, pass `reasoning` / `contextWindow` and the change handlers: the
 * choice belongs to that chat. Without them (Settings → General) it edits the
 * defaults new chats start from.
 */
export function KodeReasoningPopover({
  modelId,
  modelName,
  className,
  side = "top",
  reasoning,
  contextWindow,
  resolvedWindow,
  onReasoningChange,
  onContextWindowChange,
  onReasoningToggle,
}: {
  modelId: string;
  /** Display name, for agents' models that aren't in Kode's catalog. */
  modelName?: string;
  className?: string;
  side?: "top" | "bottom";
  /** This chat's reasoning; omit to edit the default. */
  reasoning?: KodeEffort | "off";
  /** This chat's chosen window (Kode models); omit to edit the default. */
  contextWindow?: number | null;
  /** Window to show for models whose window is fixed (null = unknown). */
  resolvedWindow?: number | null;
  onReasoningChange?: (next: KodeEffort | "off") => void;
  onContextWindowChange?: (next: number) => void;
  /** Kept for callers that track an on/off flag separately. */
  reasoningEnabled?: boolean;
  onReasoningToggle?: (enabled: boolean) => void;
}) {
  const settings = useAppSettings();
  const controls = getModelControls(modelId, settings, modelName);
  const { efforts, canDisable, contextOptions, kodeModel, note } = controls;
  const chosenReasoning = reasoning ?? settings.kodeReasoning;
  const chosenWindow = contextWindow !== undefined ? contextWindow : settings.kodeContextWindow;

  const adjustable = efforts.length > 0;
  const off = chosenReasoning === "off" && canDisable;
  const effort = off || !adjustable ? null : effortFor(efforts, chosenReasoning === "off" ? "high" : chosenReasoning);
  const contextBudget = kodeModel ? kodeContextBudget(kodeModel, chosenWindow) : (resolvedWindow ?? null);
  const windowText = contextBudget ? formatContext(contextBudget) : null;

  const label = off
    ? `Thinking off${windowText ? ` · ${windowText}` : ""}`
    : effort
      ? `${EFFORT_LABEL[effort]}${windowText ? ` · ${windowText}` : ""}`
      : windowText
        ? `${windowText} context`
        : "Context";
  // Nothing to choose and nothing to show: no chip.
  if (!adjustable && !canDisable && contextOptions.length === 0 && !windowText) return null;

  const chooseEffort = (next: KodeEffort | "off") => {
    if (onReasoningChange) onReasoningChange(next);
    else updateSettings({ kodeReasoning: next });
    onReasoningToggle?.(next !== "off");
  };
  const chooseWindow = (size: number) => {
    if (onContextWindowChange) onContextWindowChange(size);
    else updateSettings({ kodeContextWindow: size });
  };

  const rowClass = "flex w-full items-center gap-2.5 px-3 py-1.5";
  const muted = off || !adjustable;
  const title = kodeModel?.name ?? modelName ?? "This model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Reasoning and context: ${label}`}
          className={cn(
            "flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
            muted
              ? "liquid-glass-pill text-zinc-700 hover:text-zinc-950 dark:text-foreground/70 dark:hover:text-foreground"
              : "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100",
            className,
          )}
        >
          <Brain size={13} className={muted ? "text-muted-foreground" : "text-purple-600 dark:text-purple-300"} />
          <span>{label}</span>
          <ChevronDown size={11} className="ml-0.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side={side} sideOffset={8} className="w-64 p-1.5 select-none">
        <p className="truncate px-3 pt-1 pb-1 text-caption font-medium text-muted-foreground/70">Reasoning · {title}</p>
        {!adjustable ? (
          <p className="px-3 pb-1.5 text-label leading-relaxed text-muted-foreground">
            {note ?? "This model decides how much to think on its own."}
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
        {kodeModel ? (
          <>
            {contextOptions.map((size) => (
              <DropdownMenuItem key={size} onSelect={() => chooseWindow(size)} className={rowClass}>
                <span className="flex-1 text-body">{formatContext(size)}</span>
                {size === Math.min(KODE_DEFAULT_CONTEXT, kodeModel.contextWindow) ? (
                  <span className="text-micro text-muted-foreground">Default</span>
                ) : size === kodeModel.contextWindow ? (
                  <span className="text-micro text-muted-foreground">Full</span>
                ) : null}
                {size === contextBudget ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
              </DropdownMenuItem>
            ))}
            <p className="px-3 pt-1 pb-1 text-caption leading-relaxed text-muted-foreground">
              Bigger windows keep more history per request and use more of your plan.
            </p>
          </>
        ) : (
          <p className="px-3 pb-1.5 text-label leading-relaxed text-muted-foreground">
            {windowText
              ? `${windowText}, set by the agent running this model.`
              : "Shown after the first reply, once the agent reports it."}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default KodeReasoningPopover;
