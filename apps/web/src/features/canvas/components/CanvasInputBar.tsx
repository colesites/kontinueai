"use client";

import { TooltipProvider } from "@repo/ui/components/ui/tooltip";
import { useSidebar } from "@repo/ui/components/ui/sidebar";
import { useCanvasInput } from "../hooks/use-canvas-input";
import { CanvasInputPrompt } from "./CanvasInputPrompt";
import { CanvasInputControls } from "./CanvasInputControls";

interface CanvasInputBarProps {
  onGenerate: (opts: {
    prompt: string;
    mode: "image" | "video";
    model: string;
    aspectRatio: string;
    resolution?: string;
    duration?: number;
    quality?: "standard" | "pro";
    negativePrompt?: string;
    imageUrl?: string;
  }) => void;
  isGenerating: boolean;
  credits: { remaining: number; total: number };
  canGenerateImages: boolean;
  canGenerateVideos: boolean;
  isPro: boolean;
}

export function CanvasInputBar({
  onGenerate,
  isGenerating,
  credits,
  canGenerateImages,
  canGenerateVideos,
  isPro,
}: CanvasInputBarProps) {
  const { state: sidebarState, isMobile: sidebarMobile } = useSidebar();

  const {
    mode,
    setMode,
    prompt,
    handlePromptChange,
    aspectRatio,
    setAspectRatio,
    resolution,
    setResolution,
    setImageModel,
    setVideoModel,
    duration,
    setDuration,
    quality,
    setQuality,
    fileInputRef,
    textareaRef,
    currentProvider,
    activeModel,
    selectedModelData,
    isFreeModel,
    costMultiplier,
    maxChars,
    canSubmit,
    handleSubmit,
    attachedImage,
    isUploading,
    handleFileAttach,
    removeAttachedImage,
  } = useCanvasInput({
    onGenerate,
    isGenerating,
    credits,
    canGenerateImages,
    canGenerateVideos,
  });

  const sidebarOffset =
    !sidebarMobile && sidebarState === "expanded"
      ? "var(--sidebar-width)"
      : "0px";

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="pointer-events-none fixed bottom-0 z-50 px-2 pb-4 transition-[left,width] duration-300 sm:px-4 sm:pb-8"
        style={{
          left: sidebarOffset,
          width: sidebarMobile ? "100vw" : `calc(100vw - ${sidebarOffset})`,
        }}
      >
        <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-border/40 bg-background/40 shadow-2xl backdrop-blur-3xl transition-colors sm:rounded-[2.5rem]">
            <CanvasInputPrompt
              prompt={prompt}
              onChange={handlePromptChange}
              onSubmit={handleSubmit}
              isGenerating={isGenerating}
              canSubmit={canSubmit}
              mode={mode}
              fileInputRef={fileInputRef}
              textareaRef={textareaRef}
              activeModel={activeModel}
              maxChars={maxChars}
              attachedImage={attachedImage}
              isUploading={isUploading}
              onFileAttach={handleFileAttach}
              onRemoveImage={removeAttachedImage}
            />

            <CanvasInputControls
              mode={mode}
              setMode={setMode}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              resolution={resolution}
              setResolution={setResolution}
              quality={quality}
              setQuality={setQuality}
              duration={duration}
              setDuration={setDuration}
              activeModel={activeModel}
              onModelChange={(v) =>
                mode === "image" ? setImageModel(v) : setVideoModel(v)
              }
              currentProvider={currentProvider}
              selectedModelData={selectedModelData}
              isFreeModel={isFreeModel}
              creditsRemaining={credits.remaining}
              creditsTotal={credits.total}
              costMultiplier={costMultiplier}
              isPro={isPro}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
