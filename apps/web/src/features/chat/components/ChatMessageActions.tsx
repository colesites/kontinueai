"use client";

import { useState } from "react";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";
import { HiSpeakerWave } from "react-icons/hi2";
import { cn } from "@repo/ui/lib/utils";
import { useCopyToClipboard } from "@repo/ui/hooks/use-copy-to-clipboard";
import { useTextToSpeech } from "../hooks/use-text-to-speech";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
} from "../../../components/ai-elements/model-selector";
import { SharedModelSelectorContent } from "../../../components/ai-elements/shared-model-selector-content";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";

interface ChatMessageActionsProps {
  content: string;
  isUser: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
  onSwitchModel?: (modelId: string) => void;
  modelOptionsByProvider?: Record<
    string,
    { id: string; name: string; disabled?: boolean }[]
  >;
  currentModelId?: string;
  isImported?: boolean;
}

const actionButtonClasses = cn(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
  "text-muted-foreground transition-all duration-150",
  "hover:bg-foreground/8 hover:text-foreground",
);

export function ChatMessageActions({
  content,
  isUser,
  onRetry,
  onEdit,
  onSwitchModel,
  modelOptionsByProvider,
  currentModelId,
  isImported,
}: ChatMessageActionsProps) {
  const [switchModelOpen, setSwitchModelOpen] = useState(false);
  const { copied, copyToClipboard } = useCopyToClipboard();
  const { isSpeaking, speechText, handleSpeak } = useTextToSpeech(content);

  const handleCopy = () => copyToClipboard(content);

  return (
    <div
      className={cn(
        "mt-1.5 flex items-center gap-0.5 transition-opacity duration-150",
        // Touch devices (no mouse) always show the actions; only hover-capable
        // devices (desktop) hide them until hover/focus.
        "opacity-100",
        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100",
        isUser && "justify-end",
      )}
    >
      <button type="button" onClick={handleCopy} className={actionButtonClasses}>
        {copied ? (
          <>
            <Check size={11} strokeWidth={2.5} />
            Copied
          </>
        ) : (
          <>
            <Copy size={11} strokeWidth={2.5} />
            Copy
          </>
        )}
      </button>

      {isUser && onEdit && (
        <button type="button" onClick={onEdit} className={actionButtonClasses}>
          <Pencil size={11} strokeWidth={2.5} />
          Edit
        </button>
      )}

      {!isUser && (
        <>
          <button
            type="button"
            onClick={handleSpeak}
            disabled={!speechText}
            className={cn(
              actionButtonClasses,
              !speechText && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
            )}
            title={isSpeaking ? "Stop reading" : "Read aloud"}
          >
            <HiSpeakerWave size={12} />
            {isSpeaking ? "Stop" : "Speak"}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={actionButtonClasses}
                title="Retry options"
              >
                <RefreshCw size={11} strokeWidth={2.5} />
                Retry
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className={cn(
                "glass rounded-xl p-1 min-w-[150px] border-foreground/10",
                "**:data-[slot=dropdown-menu-item]:rounded-lg **:data-[slot=dropdown-menu-item]:px-2.5 **:data-[slot=dropdown-menu-item]:py-1.5",
                "**:data-[slot=dropdown-menu-item]:cursor-pointer **:data-[slot=dropdown-menu-item]:text-[12.5px]",
                "**:data-[slot=dropdown-menu-item]:focus:bg-foreground/6 **:data-[slot=dropdown-menu-item]:focus:text-foreground",
              )}
            >
              <DropdownMenuItem onClick={onRetry} disabled={!onRetry}>
                Try again
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-foreground/8" />
              <DropdownMenuItem onClick={() => setSwitchModelOpen(true)}>
                Switch model
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ModelSelector
            open={switchModelOpen}
            onOpenChange={setSwitchModelOpen}
          >
            <ModelSelectorTrigger asChild>
              <button className="hidden" aria-hidden="true" />
            </ModelSelectorTrigger>
            <ModelSelectorContent className="sm:max-w-4xl h-[75vh] sm:h-[620px] p-0 flex flex-col overflow-hidden">
              <SharedModelSelectorContent
                selectedModelId={currentModelId}
                onModelSelect={(id) => {
                  onSwitchModel?.(id);
                  setSwitchModelOpen(false);
                }}
                modelIdsFilter={
                  modelOptionsByProvider
                    ? Object.values(modelOptionsByProvider)
                        .flat()
                        .filter((m) => !m.disabled)
                        .map((m) => m.id)
                    : undefined
                }
              />
            </ModelSelectorContent>
          </ModelSelector>
        </>
      )}

      {isImported && (
        <span className="ml-1 rounded-full bg-foreground/5 ring-1 ring-foreground/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Imported
        </span>
      )}
    </div>
  );
}
