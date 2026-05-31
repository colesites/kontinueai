"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@repo/ui/lib/utils";
import { IoMicOutline } from "react-icons/io5";

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputProvider,
} from "../../../components/ai-elements/prompt-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

import { ChatInputBodyExtras } from "./ChatInputBodyExtras";
import { ChatInputTools } from "./ChatInputTools";
import { MentionMenu } from "./MentionMenu";
import { MentionInput, type MentionInputHandle } from "./MentionInput";
import {
  useConnectorMentions,
  type MentionItem,
} from "../hooks/use-connector-mentions";

import { useSpeechInput } from "../hooks/use-speech-input";
import { useFileAttachments } from "../hooks/use-file-attachments";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { isKaiModel } from "@repo/ai/lib/kai";
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
  agentId = null,
  onAgentChange,
}: ChatInputProps & {
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  imageAspectRatio?: string;
  imageSize?: string | null;
  onImageAspectRatioChange?: (value: string) => void;
  onImageSizeChange?: (value: string | null) => void;
  agentId?: string | null;
  onAgentChange?: (value: string | null) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const canUsePaidFeatures = useIsProPlan();

  // -- @-mention autocomplete for connected connectors --
  const inputRef = useRef<MentionInputHandle>(null);
  const allMentions = useConnectorMentions();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionItems =
    mentionQuery !== null
      ? allMentions.filter(
          (m) =>
            m.provider.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
            m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
        )
      : [];
  const mentionOpen = mentionQuery !== null && mentionItems.length > 0;

  const handleMentionQueryChange = (query: string | null) => {
    // Only reset the highlighted item when the query text actually changes —
    // otherwise arrow-key navigation (which fires keyup with the same query)
    // would snap the selection back to the first item.
    if (query !== mentionQuery) setMentionIndex(0);
    setMentionQuery(query);
  };

  const insertMention = (item: MentionItem) => {
    inputRef.current?.insertMention(item);
    setMentionQuery(null);
    setMentionIndex(0);
  };

  const handleMentionKeyDown = (e: React.KeyboardEvent) => {
    if (!mentionOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setMentionIndex((i) => (i + 1) % mentionItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      insertMention(mentionItems[mentionIndex] ?? mentionItems[0]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setMentionQuery(null);
    }
  };

  const { getCapabilities } = useModelCapabilities();
  const selectedModelData = AVAILABLE_MODELS.find((m) => m.id === model);
  // K-AI's web search is free for every tier (own daily quota), so it isn't
  // gated behind paid plans like the gateway models' Perplexity search.
  const isKaiSearch = isKaiModel(model);
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
    inputRef.current?.clear();
    clearFiles();
    if (isListening) stopListening();
  };

  return (
    <div
      className="glass relative bg-background/40 backdrop-blur-3xl rounded-3xl p-3 focus-within:ring-soft transition-shadow duration-200"
      onKeyDownCapture={handleMentionKeyDown}
    >
      {mentionOpen && (
        <MentionMenu
          items={mentionItems}
          activeIndex={mentionIndex}
          onSelect={insertMention}
          onHover={setMentionIndex}
        />
      )}
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
              <MentionInput
                ref={inputRef}
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                onMentionQueryChange={handleMentionQueryChange}
                placeholder="Ask anything..."
                disabled={disabled}
              />
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
              webSearchEnabled={canUsePaidFeatures || isKaiSearch ? webSearchEnabled : false}
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
              agentId={agentId}
              onAgentChange={onAgentChange}
            />
            <div className="flex items-center gap-1.5 shrink-0">
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
