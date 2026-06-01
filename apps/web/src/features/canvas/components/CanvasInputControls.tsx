"use client";

import { Image as ImageIcon, Video, Clock, Zap, Maximize } from "lucide-react";
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  ASPECT_RATIOS,
  VIDEO_DURATIONS,
  isRatioSupported,
  isDurationSupported,
  CanvasModel,
  K_VIDEO_MODEL_ID,
  kVideoDurationsForTier,
  kVideoAllowedResolutions,
  formatDuration,
} from "@repo/ai/lib/canvas-models";
import { usePlanTier } from "@web/lib/use-plan-tier";
import { PillSelect } from "./PillSelect";
import { MobileSettings } from "./MobileSettings";
import { RatioIcon } from "./RatioIcon";
import { Divider } from "./InputPills";
import { CanvasCredits } from "./CanvasCredits";

interface CanvasInputControlsProps {
  mode: "image" | "video";
  setMode: (mode: "image" | "video") => void;
  aspectRatio: string;
  setAspectRatio: (ratio: string) => void;
  quality: "standard" | "pro";
  setQuality: (quality: "standard" | "pro") => void;
  duration: number;
  setDuration: (duration: number) => void;
  resolution: string;
  setResolution: (res: string) => void;
  activeModel: string;
  onModelChange: (modelId: string) => void;
  currentProvider: string;
  selectedModelData?: CanvasModel;
  isFreeModel: boolean;
  creditsRemaining: number;
  creditsTotal: number;
  costMultiplier: number;
  isPro: boolean;
}

export function CanvasInputControls({
  mode,
  setMode,
  aspectRatio,
  setAspectRatio,
  quality,
  setQuality,
  duration,
  setDuration,
  resolution,
  setResolution,
  activeModel,
  onModelChange,
  currentProvider,
  selectedModelData,
  isFreeModel,
  creditsRemaining,
  creditsTotal,
  costMultiplier,
  isPro,
}: CanvasInputControlsProps) {
  const models = mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const planTier = usePlanTier();
  const isKVideo = activeModel === K_VIDEO_MODEL_ID;

  // K-Video exposes plan-tiered durations/resolutions; other models keep their
  // existing (credit-bounded) behavior.
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

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-4 pt-1 sm:gap-2 sm:px-8 sm:pb-5">
      <PillSelect
        value={mode}
        onChange={(v) => setMode(v as "image" | "video")}
        header="Type"
        tooltip="Select generation type"
        align="start"
        options={[
          {
            value: "image",
            label: "Image",
            icon: <ImageIcon className="h-3.5 w-3.5" />,
          },
          {
            value: "video",
            label: "Video",
            icon: <Video className="h-3.5 w-3.5" />,
          },
        ]}
      />

      <MobileSettings
        mode={mode}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        quality={quality}
        setQuality={setQuality}
        duration={duration}
        setDuration={setDuration}
        resolution={resolution}
        setResolution={setResolution}
        creditsRemaining={creditsRemaining}
        costMultiplier={costMultiplier}
        isFreeModel={isFreeModel}
        currentProvider={currentProvider}
        activeModel={activeModel}
        className="inline-flex sm:hidden"
        align="center"
      />

      {currentProvider !== "Alibaba" && (
        <PillSelect
          value={aspectRatio}
          onChange={setAspectRatio}
          icon={
            <RatioIcon
              ratio={aspectRatio}
              className="text-foreground/40 group-hover:text-foreground"
            />
          }
          tooltip="Aspect Ratio"
          className="hidden sm:inline-flex"
          options={ASPECT_RATIOS.map((r) => ({
            value: r.value,
            label: r.label,
            icon: <RatioIcon ratio={r.value} className="text-foreground/80" />,
            disabled: !isRatioSupported(currentProvider, r.value),
          }))}
        />
      )}

      {resolutionOptions.length > 0 && (
        <PillSelect
          value={resolution}
          onChange={setResolution}
          icon={
            <Maximize className="h-3.5 w-3.5 text-foreground/40 group-hover:text-foreground" />
          }
          tooltip="Resolution"
          label={
            resolutionOptions.find((r) => r.value === resolution)?.label
          }
          className="hidden sm:inline-flex"
          options={resolutionOptions.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
        />
      )}

      {activeModel.startsWith("klingai/") && (
        <PillSelect
          value={quality}
          onChange={(v) => setQuality(v as "standard" | "pro")}
          tooltip="Quality"
          label={quality === "standard" ? "STA" : "PRO"}
          className="hidden sm:inline-flex"
          options={[
            { value: "standard", label: "Standard" },
            { value: "pro", label: "PRO" },
          ]}
          icon={<Zap className="h-3.5 w-3.5" />}
        />
      )}

      {mode === "video" && (
        <PillSelect
          value={String(duration)}
          onChange={(v) => setDuration(Number(v))}
          icon={<Clock className="h-3.5 w-3.5" />}
          tooltip="Duration"
          label={formatDuration(duration)}
          className="hidden sm:inline-flex"
          options={durationOptions.map((d) => ({
            value: String(d),
            label: formatDuration(d),
          }))}
        />
      )}

      <div className="hidden flex-1 sm:block" />

      <Divider className="sm:hidden" />

      <PillSelect
        value={activeModel}
        onChange={onModelChange}
        tooltip="AI Model"
        align="end"
        isPro={isPro}
        label={models.find((m) => m.id === activeModel)?.name.toUpperCase()}
        options={models.map((m) => ({
          value: m.id,
          label: m.name,
          isFree: m.isFree,
          // Free models (K-Image/K-Video) are always selectable. Otherwise:
          // image needs Starter/Pro, video needs Pro.
          disabled:
            !m.isFree &&
            (mode === "image" ? planTier === "free" : planTier !== "pro"),
        }))}
      />

      <CanvasCredits
        isPro={isPro}
        mode={mode}
        remaining={creditsRemaining}
        total={creditsTotal}
      />
    </div>
  );
}
