import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { ChevronDown } from "lucide-react";
import { ModelCapabilityIcons } from "../../../components/ai-elements/model-capability-icons";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorLogo,
	ModelSelectorName,
	ModelSelectorTrigger,
} from "../../../components/ai-elements/model-selector";
import { PremiumModelBadge } from "../../../components/ai-elements/premium-model-badge";
import { PromptInputButton } from "../../../components/ai-elements/prompt-input";
import { SharedModelSelectorContent } from "../../../components/ai-elements/shared-model-selector-content";

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
				<PromptInputButton className="group rounded-full border border-foreground/8 bg-foreground/[0.03] px-2.5 hover:bg-foreground/8 hover:border-foreground/15 data-[state=open]:bg-foreground/8 data-[state=open]:border-primary/35">
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
			<ModelSelectorContent className="h-[min(84dvh,680px)] p-0 sm:max-w-3xl">
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
