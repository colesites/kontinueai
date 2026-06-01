"use client";

import React from "react";
import { VscSettings } from "react-icons/vsc";
import {
  Zap,
  Clock,
  Check,
  ChevronRight,
  ChevronLeft,
  Maximize,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  ASPECT_RATIOS,
  VIDEO_DURATIONS,
  isRatioSupported,
  isDurationSupported,
  IMAGE_MODELS,
  VIDEO_MODELS,
  CanvasModel,
  K_VIDEO_MODEL_ID,
  kVideoDurationsForTier,
  kVideoAllowedResolutions,
  formatDuration,
} from "@repo/ai/lib/canvas-models";
import { usePlanTier } from "@web/lib/use-plan-tier";
import { cn } from "@repo/ui/lib/utils";
import { RatioIcon } from "./RatioIcon";

interface MobileSettingsProps {
  mode: "image" | "video";
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  quality: "standard" | "pro";
  setQuality: (v: "standard" | "pro") => void;
  duration: number;
  setDuration: (v: number) => void;
  resolution: string;
  setResolution: (v: string) => void;
  creditsRemaining: number;
  costMultiplier: number;
  isFreeModel?: boolean;
  currentProvider?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

type View = "main" | "aspectRatio" | "quality" | "duration" | "resolution";

export function MobileSettings({
  mode,
  aspectRatio,
  setAspectRatio,
  quality,
  setQuality,
  duration,
  setDuration,
  resolution,
  setResolution,
  creditsRemaining,
  costMultiplier,
  isFreeModel = false,
  currentProvider,
  className,
  align = "start",
  activeModel,
}: MobileSettingsProps & { activeModel: string }) {
  const [view, setView] = React.useState<View>("main");

  // Get model data to check for resolutions
  const models = mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const selectedModelData = models.find(
    (m: CanvasModel) => m.id === activeModel
  );
  const planTier = usePlanTier();
  const isKVideo = activeModel === K_VIDEO_MODEL_ID;
  const resolutionOptions = isKVideo
    ? kVideoAllowedResolutions(planTier)
    : (selectedModelData?.resolutions ?? []);
  const durationOptions = isKVideo
    ? kVideoDurationsForTier(planTier)
    : VIDEO_DURATIONS.filter(
        (d) =>
          isDurationSupported(activeModel, d) &&
          (isFreeModel || d * costMultiplier <= creditsRemaining),
      );
  const hasResolutions = resolutionOptions.length > 0;

  const dropdownContentClasses =
    "z-[100] min-w-[240px] rounded-[2.5rem] border border-border/20 bg-background/95 p-3 text-popover-foreground shadow-2xl backdrop-blur-3xl transition-all duration-300 animate-in fade-in zoom-in-95 slide-in-from-bottom-4";
  const itemClasses =
    "flex w-full cursor-pointer items-center gap-3 rounded-[1.5rem] px-4 py-4 text-sm font-semibold transition-all hover:bg-secondary/10 active:scale-[0.98]";

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTimeout(() => setView("main"), 200);
    }
  };

  return (
    <div className={cn("inline-flex shrink-0", className)}>
      <DropdownMenu onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-secondary/20 text-foreground/70 transition-all hover:bg-secondary/40 hover:text-foreground focus:outline-none"
            title="Settings"
          >
            <VscSettings className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          sideOffset={16}
          align={align}
          className={dropdownContentClasses}
        >
          {view === "main" ? (
            <div className="space-y-1">
              <div className="px-4 pt-1 pb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  Generation Settings
                </span>
              </div>

              {!hasResolutions ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setView("aspectRatio");
                  }}
                  className={itemClasses}
                >
                  <RatioIcon
                    ratio={aspectRatio}
                    className="text-foreground/40"
                  />
                  <span className="flex-1 text-left text-foreground/80 uppercase tracking-wider ml-1">
                    Aspect ratio
                  </span>
                  <span className="text-foreground/40 font-black">
                    {aspectRatio}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/10" />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setView("resolution");
                  }}
                  className={itemClasses}
                >
                  <Maximize className="h-4 w-4 text-foreground/40" />
                  <span className="flex-1 text-left text-foreground/80 uppercase tracking-wide">
                    Resolution
                  </span>
                  <span className="text-foreground/40 font-black">
                    {resolutionOptions.find(
                      (r: { value: string; label: string }) =>
                        r.value === resolution
                    )?.label || resolution}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/10" />
                </button>
              )}

              {activeModel.startsWith("klingai/") && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setView("quality");
                  }}
                  className={itemClasses}
                >
                  <Zap className="h-4 w-4 text-foreground/40" />
                  <span className="flex-1 text-left text-foreground/80 uppercase tracking-wide">
                    Quality
                  </span>
                  <span className="text-foreground/40 font-black">
                    {quality === "standard" ? "STA" : "PRO"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/10" />
                </button>
              )}

              {mode === "video" && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setView("duration");
                  }}
                  className={itemClasses}
                >
                  <Clock className="h-4 w-4 text-foreground/40" />
                  <span className="flex-1 text-left text-foreground/80 uppercase tracking-wide">
                    Duration
                  </span>
                  <span className="text-foreground/40 font-black">
                    {formatDuration(duration)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-foreground/10" />
                </button>
              )}
            </div>
          ) : view === "aspectRatio" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                <button
                  onClick={() => setView("main")}
                  className="p-2 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  Select Ratio
                </span>
              </div>
              {ASPECT_RATIOS.map((r) => {
                const disabled = currentProvider
                  ? !isRatioSupported(currentProvider, r.value)
                  : false;
                return (
                  <button
                    key={r.value}
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) {
                        setAspectRatio(r.value);
                        setView("main");
                      }
                    }}
                    className={cn(
                      itemClasses,
                      aspectRatio === r.value && "bg-secondary/5",
                      disabled && "cursor-not-allowed opacity-20 grayscale"
                    )}
                  >
                    <RatioIcon ratio={r.value} className="text-foreground/80" />
                    <span className="flex-1 text-left font-bold text-foreground/80">
                      {r.label}
                    </span>
                    {aspectRatio === r.value && !disabled && (
                      <Check className="h-4 w-4 text-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : view === "resolution" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                <button
                  onClick={() => setView("main")}
                  className="p-2 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  Select Res
                </span>
              </div>
              {resolutionOptions.map(
                (r: { value: string; label: string }) => (
                  <button
                    key={r.value}
                    onClick={() => {
                      setResolution(r.value);
                      setView("main");
                    }}
                    className={cn(
                      itemClasses,
                      resolution === r.value && "bg-secondary/5"
                    )}
                  >
                    <Maximize className="h-4 w-4 text-foreground/40" />
                    <span className="flex-1 text-left font-bold text-foreground/80">
                      {r.label}
                    </span>
                    {resolution === r.value && (
                      <Check className="h-4 w-4 text-foreground" />
                    )}
                  </button>
                )
              )}
            </div>
          ) : view === "quality" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                <button
                  onClick={() => setView("main")}
                  className="p-2 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  Quality
                </span>
              </div>
              {[
                { value: "standard", label: "Standard" },
                { value: "pro", label: "PRO" },
              ].map((q) => (
                <button
                  key={q.value}
                  onClick={() => {
                    setQuality(q.value as "standard" | "pro");
                    setView("main");
                  }}
                  className={cn(
                    itemClasses,
                    quality === q.value && "bg-secondary/5"
                  )}
                >
                  <Zap className="h-4 w-4 text-foreground/40" />
                  <span className="flex-1 text-left font-bold text-foreground/80">
                    {q.label}
                  </span>
                  {quality === q.value && (
                    <Check className="h-4 w-4 text-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                <button
                  onClick={() => setView("main")}
                  className="p-2 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  Duration
                </span>
              </div>
              {durationOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDuration(d);
                    setView("main");
                  }}
                  className={cn(
                    itemClasses,
                    duration === d && "bg-secondary/5"
                  )}
                >
                  <Clock className="h-4 w-4 text-foreground/40" />
                  <span className="flex-1 text-left font-bold text-foreground/80">
                    {formatDuration(d)}
                  </span>
                  {duration === d && (
                    <Check className="h-4 w-4 text-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
