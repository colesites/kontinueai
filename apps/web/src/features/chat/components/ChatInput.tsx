"use client";

import { useEffect, useState } from "react";
import { cn } from "@repo/ui/lib/utils";
import { IoMicOutline } from "react-icons/io5";

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputProvider,
} from "../../../components/ai-elements/prompt-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

import { ChatInputBodyExtras } from "./ChatInputBodyExtras";
import { ChatInputTools } from "./ChatInputTools";

import { useSpeechInput } from "../hooks/use-speech-input";
import { useFileAttachments } from "../hooks/use-file-attachments";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { useIsProPlan } from "../../../lib/use-plan-tier";
import type { ChatInputProps } from "../types";

export function ChatInput({
  onSend,
  isLoading,
  disabled,
  onStop,
  model,
  onModelChange,
  webSearchEnabled = false,
  onWebSearchToggle,
  imageAspectRatio = "auto",
  imageSize = null,
  onImageAspectRatioChange,
  onImageSizeChange,
}: ChatInputProps & {
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  imageAspectRatio?: string;
  imageSize?: string | null;
  onImageAspectRatioChange?: (value: string) => void;
  onImageSizeChange?: (value: string | null) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const canUsePaidFeatures = useIsProPlan();

  const { getCapabilities } = useModelCapabilities();
  const selectedModelData = AVAILABLE_MODELS.find((m) => m.id === model);
  const canSearch =
    !!selectedModelData &&
    getCapabilities(selectedModelData.id).includes("web-search");
  const canGenerateImage =
    !!selectedModelData &&
    getCapabilities(selectedModelData.id).includes("image-generation");

  const {
    isListening,
    activeRecognitionLanguage,
    speechSupported,
    toggleListening,
    stopListening,
  } = useSpeechInput({ inputValue, setInputValue });

  const {
    attachedFiles,
    fileInputRef,
    handleFileSelect,
    handleAttachClick,
    removeFile,
    clearFiles,
  } = useFileAttachments({ enabled: canUsePaidFeatures });

  useEffect(() => {
    if (!canUsePaidFeatures && attachedFiles.length > 0) {
      clearFiles();
    }
  }, [attachedFiles.length, canUsePaidFeatures, clearFiles]);

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    onSend(
      inputValue,
      canUsePaidFeatures && attachedFiles.length > 0 ? attachedFiles : undefined,
    );
    setInputValue("");
    clearFiles();
    if (isListening) stopListening();
  };

  return (
    <div className="glass rounded-3xl p-3 focus-within:ring-soft transition-shadow duration-200">
      <PromptInputProvider>
        <PromptInput
          onSubmit={handleSubmit}
          isLoading={isLoading}
          disabled={disabled}
          value={inputValue}
          onValueChange={setInputValue}
        >
          <PromptInputBody>
            <div className="px-2 pt-1.5">
              <PromptInputTextarea />
            </div>
            <ChatInputBodyExtras
              isListening={isListening}
              activeRecognitionLanguage={activeRecognitionLanguage}
              attachedFiles={attachedFiles}
              onRemoveFile={removeFile}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <ChatInputTools
              model={model}
              modelSelectorOpen={modelSelectorOpen}
              onModelSelectorOpenChange={setModelSelectorOpen}
              onModelChange={onModelChange}
              canUsePaidFeatures={canUsePaidFeatures}
              webSearchEnabled={canUsePaidFeatures ? webSearchEnabled : false}
              onWebSearchToggle={onWebSearchToggle}
              canSearch={canSearch}
              canGenerateImage={canGenerateImage}
              fileInputRef={fileInputRef}
              onAttachClick={handleAttachClick}
              onFileSelect={handleFileSelect}
              imageAspectRatio={imageAspectRatio}
              imageSize={imageSize}
              onImageAspectRatioChange={onImageAspectRatioChange}
              onImageSizeChange={onImageSizeChange}
            />
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <PromptInputButton
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all duration-200",
                      isListening
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30 animate-pulse-soft hover:bg-primary/25"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                    aria-label={isListening ? "Stop voice input" : "Start voice input"}
                  >
                    <IoMicOutline className="h-4 w-4" />
                  </PromptInputButton>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>
                  {isListening
                    ? "Voice input is active. Click to stop."
                    : speechSupported
                      ? "Use your microphone to dictate."
                      : "Speech recognition is not supported in this browser."}
                </TooltipContent>
              </Tooltip>
              <PromptInputSubmit onStop={onStop} />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  );
}
