"use client";

import type { ChangeEvent, RefObject } from "react";
import { CiGlobe } from "react-icons/ci";
import { FaPaperclip } from "react-icons/fa";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@repo/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { ChatInputImageOptions } from "./ChatInputImageOptions";
import { ChatInputModelSelector } from "./ChatInputModelSelector";
import {
  PromptInputButton,
  PromptInputTools,
} from "../../../components/ai-elements/prompt-input";

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PromptInputButton
            type="button"
            className="px-2 text-muted-foreground hover:text-foreground"
            aria-label="Add attachment or tools"
          >
            <Plus className="h-4 w-4" />
          </PromptInputButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-48 bg-background/80 backdrop-blur-xl border-foreground/10">
          {showWebSearchButton && (
            <DropdownMenuItem
              onClick={handleWebSearchClick}
              className={cn("cursor-pointer gap-2", isWebSearchEnabled && "text-primary focus:text-primary")}
            >
              <CiGlobe className="h-4 w-4" />
              <span>{isWebSearchEnabled ? "Web Search (On)" : "Web Search (Off)"}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleAttachClick} className="cursor-pointer gap-2">
            <FaPaperclip className="h-4 w-4" />
            <span>Attach File</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChatInputModelSelector
        model={model}
        onModelChange={onModelChange}
        open={modelSelectorOpen}
        onOpenChange={onModelSelectorOpenChange}
      />

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
