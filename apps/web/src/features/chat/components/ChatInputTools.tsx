"use client";

import { useState, type ChangeEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { CiGlobe } from "react-icons/ci";
import { FaPaperclip } from "react-icons/fa";
import { Bot, Check, ChevronLeft, ChevronRight, Plug, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@repo/ui/lib/utils";
import { AGENTS } from "@repo/ai/lib/agents";
import { isKaiModel } from "@repo/ai/lib/kai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  agentId?: string | null;
  onAgentChange?: (value: string | null) => void;
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
  agentId = null,
  onAgentChange,
}: ChatInputToolsProps) {
  const router = useRouter();
  // Drill-in navigation inside the "+" menu: "root" shows the tools, "agents"
  // swaps the same panel to the agent list with a back arrow (works on mobile
  // where side-flyout submenus clip off-screen).
  const [menuView, setMenuView] = useState<"root" | "agents">("root");
  const activeAgent = AGENTS.find((a) => a.id === agentId) ?? null;
  // K-AI's web search is free for every tier (bounded by a daily quota), so it
  // isn't gated behind paid plans like the gateway models' Perplexity search.
  const isKai = isKaiModel(model);
  const webSearchAllowed = canUsePaidFeatures || isKai;
  const isWebSearchEnabled = webSearchAllowed && webSearchEnabled;
  const showWebSearchButton = canSearch;
  const handleWebSearchClick = () => {
    if (!webSearchAllowed) {
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
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setMenuView("root");
        }}
      >
        <DropdownMenuTrigger asChild>
          <PromptInputButton
            type="button"
            className="px-2 text-muted-foreground hover:text-foreground"
            aria-label="Add attachment or tools"
          >
            <Plus className="h-4 w-4" />
          </PromptInputButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-56 bg-background/80 backdrop-blur-xl border-foreground/10">
          {menuView === "root" ? (
            <>
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
              <DropdownMenuItem
                onClick={() => {
                  // Remember where to return after the (possibly OAuth-redirecting)
                  // connectors flow, since browser history gets clobbered.
                  try {
                    sessionStorage.setItem(
                      "connectors:returnTo",
                      window.location.pathname + window.location.search,
                    );
                  } catch {
                    // ignore storage failures
                  }
                  router.push("/settings/connectors");
                }}
                className="cursor-pointer gap-2"
              >
                <Plug className="h-4 w-4" />
                <span>Connectors</span>
              </DropdownMenuItem>

              {onAgentChange && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setMenuView("agents");
                  }}
                  className="cursor-pointer gap-2"
                >
                  <Bot className="h-4 w-4" />
                  <span>Agents</span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    {activeAgent ? activeAgent.name : "None"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setMenuView("root");
                }}
                className="cursor-pointer gap-2 text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Agents</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onAgentChange?.(null)}
                className={cn("cursor-pointer gap-2", !agentId && "text-primary focus:text-primary")}
              >
                <Check className={cn("h-4 w-4 shrink-0", agentId ? "opacity-0" : "opacity-100")} />
                <span>None</span>
              </DropdownMenuItem>
              {AGENTS.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => onAgentChange?.(agent.id)}
                  className={cn(
                    "cursor-pointer gap-2",
                    agentId === agent.id && "text-primary focus:text-primary",
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      agentId === agent.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{agent.name}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
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
