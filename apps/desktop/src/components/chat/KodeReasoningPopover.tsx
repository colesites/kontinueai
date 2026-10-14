import { useState, useMemo } from "react";
import { Brain, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isReasoningModelId } from "@repo/core/model-capabilities";

export type ReasoningLevel = "low" | "medium" | "high" | "max" | "ultrathink" | "off";
export type ContextWindow = string;
export type FastMode = "on" | "off";

const STORAGE_KEY_REASONING = "kontinue.kode.reasoning-level";
const STORAGE_KEY_CONTEXT = "kontinue.kode.context-window";
const STORAGE_KEY_FAST = "kontinue.kode.fast-mode";

export function useKodeReasoningPreferences() {
  const [reasoning, setReasoningState] = useState<ReasoningLevel>(() => {
    if (typeof window === "undefined") return "high";
    return (localStorage.getItem(STORAGE_KEY_REASONING) as ReasoningLevel) || "high";
  });

  const [contextWindow, setContextWindowState] = useState<ContextWindow>(() => {
    if (typeof window === "undefined") return "1M";
    return localStorage.getItem(STORAGE_KEY_CONTEXT) || "1M";
  });

  const [fastMode, setFastModeState] = useState<FastMode>(() => {
    if (typeof window === "undefined") return "off";
    return (localStorage.getItem(STORAGE_KEY_FAST) as FastMode) || "off";
  });

  const setReasoning = (level: ReasoningLevel) => {
    setReasoningState(level);
    localStorage.setItem(STORAGE_KEY_REASONING, level);
  };

  const setContextWindow = (ctx: ContextWindow) => {
    setContextWindowState(ctx);
    localStorage.setItem(STORAGE_KEY_CONTEXT, ctx);
  };

  const setFastMode = (fast: FastMode) => {
    setFastModeState(fast);
    localStorage.setItem(STORAGE_KEY_FAST, fast);
  };

  return {
    reasoning,
    setReasoning,
    contextWindow,
    setContextWindow,
    fastMode,
    setFastMode,
  };
}

export function KodeReasoningPopover({
  modelId,
  className,
  reasoningEnabled,
  onReasoningToggle,
}: {
  modelId?: string;
  className?: string;
  reasoningEnabled?: boolean;
  onReasoningToggle?: (enabled: boolean) => void;
}) {
  const {
    reasoning,
    setReasoning,
    contextWindow,
    setContextWindow,
    fastMode,
    setFastMode,
  } = useKodeReasoningPreferences();

  // Check if current model supports reasoning
  const supportsReasoning = useMemo(() => {
    if (!modelId) return true;
    return isReasoningModelId(modelId);
  }, [modelId]);

  // Compute model-specific context window options
  const contextOptions = useMemo(() => {
    const id = (modelId || "").toLowerCase();
    if (id.includes("gemini") || id.includes("flash") || id.includes("pro")) {
      return [
        { id: "200k", label: "200k" },
        { id: "1M", label: "1M", isDefault: true },
      ];
    }
    if (
      id.includes("kode") ||
      id.includes("sonnet") ||
      id.includes("m3") ||
      id.includes("glm") ||
      id.includes("opus")
    ) {
      return [
        { id: "128k", label: "128k" },
        { id: id.includes("kode") ? "262k" : "200k", label: id.includes("kode") ? "262k" : "200k", isDefault: true },
      ];
    }
    return [
      { id: "64k", label: "64k" },
      { id: "128k", label: "128k", isDefault: true },
    ];
  }, [modelId]);

  // If reasoning is not supported or explicitly disabled, treat as off
  const effectiveReasoning = !supportsReasoning
    ? "off"
    : reasoningEnabled === false
    ? "off"
    : reasoning === "off"
    ? "off"
    : reasoning;

  const isOff = effectiveReasoning === "off";
  const activeCtx = contextOptions.some((c) => c.id === contextWindow)
    ? contextWindow
    : (contextOptions.find((c) => c.isDefault)?.id ?? contextOptions[0]?.id ?? "1M");

  const displayLabel = !supportsReasoning
    ? "No Reasoning"
    : isOff
    ? "Thinking Off"
    : `${effectiveReasoning.charAt(0).toUpperCase() + effectiveReasoning.slice(1)} · ${activeCtx}`;

  const handleSelectReasoning = (level: ReasoningLevel) => {
    if (!supportsReasoning && level !== "off") return;
    setReasoning(level);
    if (level === "off") {
      onReasoningToggle?.(false);
    } else {
      onReasoningToggle?.(true);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Reasoning settings: ${displayLabel}`}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all cursor-pointer select-none",
            !isOff && supportsReasoning
              ? "border-purple-500/35 bg-purple-500/10 text-white font-medium hover:border-purple-500/50 hover:bg-purple-500/15"
              : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:border-white/[0.15] hover:bg-white/[0.08] hover:text-white",
            className
          )}
        >
          <Brain
            size={13}
            className={cn(
              "transition-colors",
              !isOff && supportsReasoning ? "text-purple-400" : "text-white/40"
            )}
          />
          <span>{displayLabel}</span>
          <ChevronDown size={11} className="text-white/40 ml-0.5" />
        </button>
      </DropdownMenuTrigger>

      {/* Popover Card matching Image 1 */}
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-52 p-1.5 rounded-xl border border-white/[0.08] bg-[#121215]/80 backdrop-blur-2xl shadow-2xl shadow-black/80 text-white select-none"
      >
        {/* Section 1: Reasoning */}
        <div>
          <div className="flex items-center justify-between px-2.5 pt-1 pb-1">
            <span className="text-[11.5px] font-medium text-white/40">Reasoning</span>
            {!supportsReasoning && (
              <span className="text-[10px] text-white/30 font-normal">N/A</span>
            )}
          </div>

          {!supportsReasoning ? (
            <div className="px-2.5 py-1 text-[11px] text-white/35 italic">
              Model has no reasoning capability
            </div>
          ) : (
            <div className="space-y-0.5">
              {(
                [
                  { id: "low", label: "Low" },
                  { id: "medium", label: "Medium" },
                  { id: "high", label: "High", isDefault: true },
                  { id: "max", label: "Max" },
                  { id: "ultrathink", label: "Ultrathink" },
                ] as const
              ).map((item) => {
                const isSelected = effectiveReasoning === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectReasoning(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer",
                      isSelected
                        ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium shadow-xs"
                        : "border border-transparent text-white/80 hover:bg-white/[0.04] hover:text-white"
                    )}
                  >
                    <span>{item.label}</span>
                    {"isDefault" in item && item.isDefault && (
                      <span className="rounded bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 tracking-tight">
                        Default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="my-1.5 h-px bg-white/[0.06]" />

        {/* Section 2: Context Window */}
        <div>
          <div className="px-2.5 pt-1 pb-1 text-[11.5px] font-medium text-white/40">
            Context Window
          </div>
          <div className="space-y-0.5">
            {contextOptions.map((item) => {
              const isSelected = activeCtx === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setContextWindow(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer",
                    isSelected
                      ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium shadow-xs"
                      : "border border-transparent text-white/80 hover:bg-white/[0.04] hover:text-white"
                  )}
                >
                  <span>{item.label}</span>
                  {"isDefault" in item && item.isDefault && (
                    <span className="rounded bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 tracking-tight">
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="my-1.5 h-px bg-white/[0.06]" />

        {/* Section 3: Fast Mode */}
        <div>
          <div className="px-2.5 pt-1 pb-1 text-[11.5px] font-medium text-white/40">
            Fast Mode
          </div>
          <div className="space-y-0.5">
            {(
              [
                { id: "on", label: "On" },
                { id: "off", label: "Off" },
              ] as const
            ).map((item) => {
              const isSelected = fastMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFastMode(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] transition-all cursor-pointer",
                    isSelected
                      ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium shadow-xs"
                      : "border border-transparent text-white/80 hover:bg-white/[0.04] hover:text-white"
                  )}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default KodeReasoningPopover;
