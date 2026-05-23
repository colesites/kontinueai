import { ChevronDown } from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "../../../components/ai-elements/model-selector";
import { SharedModelSelectorContent } from "../../../components/ai-elements/shared-model-selector-content";
import { PremiumModelBadge } from "../../../components/ai-elements/premium-model-badge";
import { ModelCapabilityIcons } from "../../../components/ai-elements/model-capability-icons";
import { PromptInputButton } from "../../../components/ai-elements/prompt-input";
import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";

type ChatInputModelSelectorProps = {
  model: string;
  onModelChange: (model: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ChatInputModelSelector({
  model,
  onModelChange,
  open,
  onOpenChange,
}: ChatInputModelSelectorProps) {
  const { getCapabilities, isProModel } = useModelCapabilities();

  const selectedModelData = AVAILABLE_MODELS.find((m) => m.id === model);

  return (
    <ModelSelector open={open} onOpenChange={onOpenChange}>
      <ModelSelectorTrigger asChild>
        <PromptInputButton className="px-2 group">
          {selectedModelData && (
            <>
              <span className="flex items-center justify-center size-5 rounded-md bg-foreground/5 border border-foreground/4 mr-0.5 shrink-0">
                <ModelSelectorLogo
                  provider={selectedModelData.provider}
                  className="size-3"
                />
              </span>
              <ModelSelectorName className="text-foreground font-medium truncate">
                {selectedModelData.name}
              </ModelSelectorName>
              {isProModel(selectedModelData.id) && (
                <PremiumModelBadge className="ml-0.5 shrink-0" />
              )}
              <ModelCapabilityIcons
                className="ml-0.5 hidden md:flex opacity-70 shrink-0"
                capabilities={getCapabilities(selectedModelData.id)}
              />
              <ChevronDown className="size-3.5 opacity-50 transition-transform group-data-[state=open]:rotate-180 shrink-0" />
            </>
          )}
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="sm:max-w-4xl h-[75vh] sm:h-[620px] p-0 flex flex-col overflow-hidden">
        <SharedModelSelectorContent
          selectedModelId={model}
          onModelSelect={(id) => {
            onModelChange(id);
            onOpenChange(false);
          }}
        />
      </ModelSelectorContent>
    </ModelSelector>
  );
}
