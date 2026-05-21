"use client";

import { Paperclip, Loader2, ArrowUp, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { cn } from "@repo/ui/lib/utils";
import type { AttachedImage } from "../hooks/use-canvas-input";

interface CanvasInputPromptProps {
  prompt: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  canSubmit: boolean;
  mode: "image" | "video";
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  activeModel: string;
  maxChars?: number;
  attachedImage: AttachedImage | null;
  isUploading: boolean;
  onFileAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
}

export function CanvasInputPrompt({
  prompt,
  onChange,
  onSubmit,
  isGenerating,
  canSubmit,
  mode,
  fileInputRef,
  textareaRef,
  activeModel,
  maxChars,
  attachedImage,
  isUploading,
  onFileAttach,
  onRemoveImage,
}: CanvasInputPromptProps) {
  const charsRemaining = maxChars ? maxChars - prompt.length : 0;

  return (
    <div className="flex flex-col gap-1 pb-1">
      {/* Attached image preview */}
      {attachedImage && (
        <div className="flex items-center gap-2 px-3 pt-3 sm:px-8 sm:pt-4">
          <div className="group relative inline-flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/10 p-1.5 pr-3 transition-colors hover:bg-secondary/20">
            <img
              src={attachedImage.previewUrl}
              alt="Attached"
              className="h-10 w-10 rounded-lg object-cover sm:h-12 sm:w-12"
            />
            <span className="max-w-[120px] truncate text-xs font-medium text-foreground/60 sm:max-w-[180px]">
              {attachedImage.filename}
            </span>
            <button
              onClick={onRemoveImage}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground/40 transition-colors hover:bg-destructive/20 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 pt-4 sm:gap-3 sm:px-8 sm:pt-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={cn(
                "mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-foreground/40 transition-colors hover:bg-secondary/40 hover:text-foreground sm:h-10 sm:w-10",
                isUploading && "cursor-wait opacity-60"
              )}
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-popover text-popover-foreground border-border"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider">
              {isUploading ? "Uploading..." : "Attach image"}
            </p>
          </TooltipContent>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileAttach}
        />

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={onChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={1}
            maxLength={maxChars}
            placeholder={
              mode === "image"
                ? "What do you want to create?"
                : "Describe your video..."
            }
            className="min-w-0 w-full resize-none bg-transparent py-2 text-base font-semibold text-foreground placeholder:text-muted-foreground/30 focus:outline-none scrollbar-hide max-h-40 sm:py-3"
            disabled={isGenerating}
          />
          {maxChars && (
            <div
              className={cn(
                "absolute -bottom-1 right-0 text-[10px] font-black uppercase tracking-widest transition-colors",
                charsRemaining <= 10 ? "text-destructive" : "text-foreground/20"
              )}
            >
              {prompt.length}/{maxChars}
            </div>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className={cn(
                "mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300 sm:h-11 sm:w-11",
                canSubmit
                  ? "bg-foreground text-background hover:scale-105 active:scale-95"
                  : "bg-secondary/20 text-foreground/20 cursor-not-allowed"
              )}
            >
              {isGenerating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowUp className="h-6 w-6" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-popover text-popover-foreground border-border"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider">
              Generate
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
