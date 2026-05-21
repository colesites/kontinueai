import { useState } from "react";
import { CheckIcon } from "lucide-react";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "../../../components/ai-elements/model-selector";
import { SharedModelSelectorContent } from "../../../components/ai-elements/shared-model-selector-content";
import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { ModelCapabilityIcons } from "../../../components/ai-elements/model-capability-icons";
import { PremiumModelBadge } from "../../../components/ai-elements/premium-model-badge";

export function ModelSelectorWrapper({
  selectedModel,
  onModelChange,
  disabled,
}: {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { getCapabilities, isProModel } = useModelCapabilities();
  const selectedModelData = AVAILABLE_MODELS.find(
    (m) => m.id === selectedModel
  );

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <button
          disabled={disabled}
          className="w-full sm:w-auto min-h-[56px] px-4 rounded-xl border border-input bg-background hover:bg-muted transition-colors flex items-center justify-center gap-2 group min-w-[140px]"
        >
          {selectedModelData && (
            <>
              <ModelSelectorLogo
                provider={selectedModelData.provider}
                className="size-4"
              />
              <span className="text-sm font-medium text-foreground truncate max-w-[80px]">
                {selectedModelData.name}
              </span>
              {isProModel(selectedModelData.id) && <PremiumModelBadge />}
              <ModelCapabilityIcons
                className="ml-1"
                capabilities={getCapabilities(selectedModelData.id)}
              />
            </>
          )}
        </button>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        title="Select Model for Chat"
        className="sm:max-w-4xl h-[75vh] sm:h-[600px] p-0 flex flex-col overflow-hidden bg-background"
      >
        <SharedModelSelectorContent
          selectedModelId={selectedModel}
          onModelSelect={(id) => {
            onModelChange(id);
            setOpen(false);
          }}
        />
      </ModelSelectorContent>
    </ModelSelector>
  );
}
