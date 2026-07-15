import { AVAILABLE_MODELS } from "@repo/ai/models";
import { canAccessModel } from "@repo/core/plan-access";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { cn } from "@repo/ui/lib/utils";
import { CheckIcon, LayoutGridIcon, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { usePlanTier } from "../../lib/use-plan-tier";
import { ModelCapabilityIcons } from "./model-capability-icons";
import {
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorLogo,
	ModelSelectorName,
} from "./model-selector";
import { PremiumModelBadge } from "./premium-model-badge";

const PROVIDER_LABELS: Record<string, string> = {
	kontinue: "Kontinue",
	openai: "OpenAI",
	anthropic: "Anthropic",
	google: "Google",
	xai: "xAI",
	deepseek: "DeepSeek",
	perplexity: "Perplexity",
	minimax: "MiniMax",
	zai: "Z.ai",
	alibaba: "Alibaba",
	moonshotai: "Moonshot AI",
	mistral: "Mistral",
};

function getProviderLabel(provider: string): string {
	return PROVIDER_LABELS[provider] ?? provider;
}

export function SharedModelSelectorContent({
	selectedModelId,
	onModelSelect,
	modelIdsFilter,
}: {
	selectedModelId?: string;
	onModelSelect: (id: string) => void;
	modelIdsFilter?: string[];
}) {
	const [activeProvider, setActiveProvider] = useState<string | null>(null);
	const { getCapabilities, getModelAccessClass } = useModelCapabilities();
	const planTier = usePlanTier();

	const modelsToDisplay = useMemo(() => {
		if (modelIdsFilter) {
			const allowedIds = new Set(modelIdsFilter);
			return AVAILABLE_MODELS.filter((model) => allowedIds.has(model.id));
		}
		return AVAILABLE_MODELS.filter((model) => model.modality !== "realtime");
	}, [modelIdsFilter]);

	const groupedModels = useMemo(() => {
		return modelsToDisplay.reduce(
			(groups, model) => {
				const providerModels = groups[model.provider] ?? [];
				providerModels.push(model);
				groups[model.provider] = providerModels;
				return groups;
			},
			{} as Record<string, typeof AVAILABLE_MODELS>,
		);
	}, [modelsToDisplay]);

	const providers = Object.keys(groupedModels);
	const visibleProviders = activeProvider ? [activeProvider] : providers;

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<header className="shrink-0 border-b border-foreground/8 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pr-16">
				<div className="flex items-start gap-3">
					<span className="surface-inset mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-primary">
						<SlidersHorizontal className="size-4" />
					</span>
					<div className="min-w-0">
						<h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
							Choose a model
						</h2>
						<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
							Find the right balance of intelligence, speed, and capability.
						</p>
					</div>
				</div>
			</header>

			<ModelSelectorInput
				placeholder={`Search ${modelsToDisplay.length} models…`}
				aria-label="Search AI models"
			/>

			<div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-foreground/8 px-4 py-2.5 sm:px-5">
				<button
					type="button"
					onClick={() => setActiveProvider(null)}
					aria-pressed={activeProvider === null}
					className={cn(
						"inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
						activeProvider === null
							? "bg-foreground text-background"
							: "surface-inset text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
					)}
				>
					<LayoutGridIcon className="size-3.5" />
					All
					<span className="opacity-60">{modelsToDisplay.length}</span>
				</button>

				{providers.map((provider) => (
					<button
						type="button"
						key={provider}
						onClick={() => setActiveProvider(provider)}
						aria-pressed={activeProvider === provider}
						className={cn(
							"inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
							activeProvider === provider
								? "bg-primary text-primary-foreground [&_img]:brightness-0 [&_img]:invert"
								: "surface-inset text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
						)}
					>
						<ModelSelectorLogo provider={provider} className="size-3.5" />
						{getProviderLabel(provider)}
						<span className="opacity-60">
							{groupedModels[provider]?.length ?? 0}
						</span>
					</button>
				))}
			</div>

			<ModelSelectorList className="no-scrollbar h-full max-h-none min-h-0 flex-1 touch-pan-y overflow-y-auto px-3 pb-4 pt-2 scroll-smooth sm:px-4">
				<ModelSelectorEmpty className="py-16 text-center text-sm text-muted-foreground">
					No matching models. Try a provider or capability name.
				</ModelSelectorEmpty>

				{visibleProviders.map((provider) => (
					<ModelSelectorGroup
						key={provider}
						className="p-0 pb-2"
						heading={
							<div className="flex items-center gap-2 px-2 pb-2 pt-3">
								<ModelSelectorLogo
									provider={provider}
									className="size-3.5 opacity-70"
								/>
								<span>{getProviderLabel(provider)}</span>
								<span className="font-normal opacity-60">
									{groupedModels[provider]?.length ?? 0}
								</span>
							</div>
						}
					>
						<div className="space-y-1.5">
							{(groupedModels[provider] ?? []).map((model) => {
								const modelClass = getModelAccessClass(model.id);
								const isKai = model.provider === "kontinue";
								const disabledByPlan =
									!isKai && !canAccessModel(planTier, model.id, modelClass);
								const isSelected = selectedModelId === model.id;
								const capabilities = getCapabilities(model.id);

								return (
									<ModelSelectorItem
										key={model.id}
										disabled={disabledByPlan}
										onSelect={() => {
											if (!disabledByPlan) onModelSelect(model.id);
										}}
										value={`${model.name} ${getProviderLabel(model.provider)} ${model.description}`}
										aria-label={`${model.name}. ${model.description}. ${isKai ? "K-AI" : `${modelClass} model`}`}
										className={cn(
											"grid min-h-[76px] cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors duration-150 [&>svg:last-child]:hidden sm:min-h-[80px] sm:px-4",
											"bg-foreground/[0.025] hover:border-foreground/10 hover:bg-foreground/[0.055] data-[selected=true]:border-foreground/12 data-[selected=true]:bg-foreground/[0.06]",
											isSelected &&
												"border-primary/35 bg-primary/[0.07] shadow-[inset_3px_0_0_var(--primary)] hover:border-primary/45 hover:bg-primary/[0.09]",
											disabledByPlan &&
												"cursor-not-allowed opacity-55 hover:border-transparent hover:bg-foreground/[0.025]",
										)}
									>
										<span
											className={cn(
												"surface-inset flex size-10 shrink-0 items-center justify-center rounded-xl",
												isSelected &&
													"bg-primary/12 text-primary ring-1 ring-primary/25",
											)}
										>
											<ModelSelectorLogo
												provider={model.provider}
												className="size-[18px]"
											/>
										</span>

										<div className="min-w-0 py-0.5">
											<div className="flex min-w-0 items-center gap-2">
												<ModelSelectorName className="min-w-0 truncate text-[13.5px] font-semibold text-foreground sm:text-sm">
													{model.name}
												</ModelSelectorName>
												{!isKai ? (
													<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/15">
														<PremiumModelBadge className="size-3 border-0 bg-transparent shadow-none ring-0" />
														{modelClass.charAt(0).toUpperCase() +
															modelClass.slice(1)}
													</span>
												) : null}
											</div>
											<p className="mt-1 truncate text-xs leading-relaxed text-muted-foreground">
												{model.description ||
													"A capable general-purpose AI model."}
											</p>
											<ModelCapabilityIcons
												capabilities={capabilities}
												className="mt-1.5 opacity-75 sm:hidden"
											/>
										</div>

										<div className="flex min-w-6 shrink-0 items-center justify-end gap-3 pl-1 sm:min-w-[112px]">
											<ModelCapabilityIcons
												capabilities={capabilities}
												className="hidden opacity-70 sm:flex"
											/>
											<span
												className={cn(
													"flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
													isSelected
														? "border-primary bg-primary text-primary-foreground"
														: "border-foreground/12 text-transparent",
												)}
											>
												<CheckIcon className="size-3" strokeWidth={3} />
											</span>
										</div>
									</ModelSelectorItem>
								);
							})}
						</div>
					</ModelSelectorGroup>
				))}
			</ModelSelectorList>
		</div>
	);
}
