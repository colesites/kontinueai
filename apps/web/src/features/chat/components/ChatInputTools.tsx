"use client";

import type { ChangeEvent, RefObject } from "react";
import { CiGlobe } from "react-icons/ci";
import { FaPaperclip } from "react-icons/fa";
import { toast } from "sonner";
import { ChatInputImageOptions } from "./ChatInputImageOptions";
import { ChatInputModelSelector } from "./ChatInputModelSelector";
import {
  PromptInputButton,
  PromptInputTools,
} from "../../../components/ai-elements/prompt-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

type ChatInputToolsProps = {
  model: string;
  modelSelectorOpen: boolean;
  onModelSelectorOpenChange: (open: boolean) => void;
  onModelChange: (model: string) => void;
  canUsePaidFeatures: boolean;
  webSearchEnabled: boolean;
  onWebSearchToggle?: () => void;
  canSearch: boolean;
  canGenerateImage: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachClick: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  imageAspectRatio: string;
  imageSize: string | null;
  onImageAspectRatioChange?: (value: string) => void;
  onImageSizeChange?: (value: string | null) => void;
};

export function ChatInputTools({
  model,
  modelSelectorOpen,
  onModelSelectorOpenChange,
  onModelChange,
  canUsePaidFeatures,
  webSearchEnabled,
  onWebSearchToggle,
  canSearch,
  canGenerateImage,
  fileInputRef,
  onAttachClick,
  onFileSelect,
  imageAspectRatio,
  imageSize,
  onImageAspectRatioChange,
  onImageSizeChange,
}: ChatInputToolsProps) {
  const isWebSearchEnabled = canUsePaidFeatures && webSearchEnabled;
  const showWebSearchButton = canSearch;
  const handleWebSearchClick = () => {
    if (!canUsePaidFeatures) {
      toast.error("Web search is available on Starter/Pro plans.");
      return;
    }
    onWebSearchToggle?.();
  };
  const handleAttachClick = () => {
    if (!canUsePaidFeatures) {
      toast.error("File uploads are available on Starter/Pro plans.");
      return;
    }
    onAttachClick();
  };

  return (
    <PromptInputTools>
      <ChatInputModelSelector
        model={model}
        onModelChange={onModelChange}
        open={modelSelectorOpen}
        onOpenChange={onModelSelectorOpenChange}
      />

      {showWebSearchButton && (
        <Tooltip>
          <TooltipTrigger asChild>
            <PromptInputButton
              type="button"
              onClick={handleWebSearchClick}
              className={
                isWebSearchEnabled
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : canUsePaidFeatures
                    ? "text-muted-foreground/70 hover:text-muted-foreground"
                    : "text-muted-foreground/40"
              }
              aria-label={
                isWebSearchEnabled ? "Disable web search" : "Enable web search"
              }
            >
              <CiGlobe className="h-4 w-4" />
            </PromptInputButton>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>
            {isWebSearchEnabled
              ? "Web search is on."
              : canUsePaidFeatures
                ? "Search the web for up-to-date answers."
                : "Web search is available on Starter/Pro plans."}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <PromptInputButton
            type="button"
            onClick={handleAttachClick}
            className={
              canUsePaidFeatures
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/40"
            }
            aria-label="Attach files"
          >
            <FaPaperclip className="h-3.5 w-3.5" />
          </PromptInputButton>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          {canUsePaidFeatures
            ? "Attach files to this message."
            : "File uploads are available on Starter/Pro plans."}
        </TooltipContent>
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,application/json,application/xml,application/x-yaml,text/xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/webm,audio/flac"
        onChange={onFileSelect}
        disabled={!canUsePaidFeatures}
        className="hidden"
      />

      {canGenerateImage && onImageAspectRatioChange && onImageSizeChange && (
        <ChatInputImageOptions
          model={model}
          imageAspectRatio={imageAspectRatio}
          imageSize={imageSize}
          onImageAspectRatioChange={onImageAspectRatioChange}
          onImageSizeChange={onImageSizeChange}
        />
      )}
    </PromptInputTools>
  );
}
