import { AVAILABLE_MODELS } from "@repo/ai/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { cn } from "@repo/ui/lib/utils";
import { CheckIcon, LayoutGridIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useIsProPlan } from "../../lib/use-plan-tier";
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
	const { getCapabilities, isProModel } = useModelCapabilities();
	const isPro = useIsProPlan();

	const modelsToDisplay = useMemo(() => {
		if (modelIdsFilter) {
			return AVAILABLE_MODELS.filter((m) => modelIdsFilter.includes(m.id));
		}
		return AVAILABLE_MODELS;
	}, [modelIdsFilter]);

	const groupedModels = useMemo(() => {
		return modelsToDisplay.reduce(
			(acc, m) => {
				const list = acc[m.provider] ?? [];
				list.push(m);
				acc[m.provider] = list;
				return acc;
			},
			{} as Record<string, typeof AVAILABLE_MODELS>,
		);
	}, [modelsToDisplay]);

	const providers = Object.keys(groupedModels);

	return (
		<div className="flex h-full w-full flex-row overflow-hidden">
			{/* Provider rail */}
			<div className="flex w-[68px] sm:w-56 flex-col border-r border-foreground/8 shrink-0">
				<div className="px-5 border-b border-foreground/8 h-14 flex items-center justify-center sm:justify-start shrink-0">
					<span className="eyebrow hidden sm:block">Providers</span>
					<LayoutGridIcon className="size-4 sm:hidden text-muted-foreground" />
				</div>
				<div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0 touch-pan-y">
					<button
						type="button"
						className={cn(
							"w-full flex items-center justify-center sm:justify-start gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-all duration-150",
							activeProvider === null
								? "bg-foreground/8 text-foreground font-medium"
								: "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
						)}
						onClick={() => setActiveProvider(null)}
						title="All Models"
					>
						<span className="flex items-center justify-center size-5 rounded-md bg-foreground/5 border border-foreground/5 shrink-0">
							<LayoutGridIcon className="size-3" />
						</span>
						<span className="hidden sm:inline">All Models</span>
					</button>
					{providers.map((provider) => (
						<button
							type="button"
							key={provider}
							className={cn(
								"w-full flex items-center justify-center sm:justify-start gap-2.5 px-2.5 py-2 text-sm rounded-lg transition-all duration-150",
								activeProvider === provider
									? "bg-foreground/8 text-foreground font-medium"
									: "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
							)}
							onClick={() => setActiveProvider(provider)}
							title={provider}
						>
							<span className="flex items-center justify-center size-5 rounded-md bg-foreground/5 border border-foreground/5 shrink-0">
								<ModelSelectorLogo provider={provider} className="size-3" />
							</span>
							<span className="capitalize hidden sm:inline truncate">
								{provider}
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Models pane */}
			<div className="flex-1 flex flex-col min-w-0 min-h-0">
				<ModelSelectorInput placeholder="Search models..." />
				<ModelSelectorList className="flex-1 min-h-0 px-4 pb-4 h-full max-h-none overflow-y-auto touch-pan-y scroll-smooth">
					<ModelSelectorEmpty className="py-16 text-sm text-muted-foreground text-center">
						No models found.
					</ModelSelectorEmpty>
					{(activeProvider ? [activeProvider] : providers).map((provider) => (
						<ModelSelectorGroup key={provider}>
							{!activeProvider && (
								<div className="px-1 pt-5 pb-3 flex items-center gap-2.5">
									<ModelSelectorLogo
										provider={provider}
										className="size-4 opacity-70"
									/>
									<span className="eyebrow">{provider}</span>
								</div>
							)}
							<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-2">
								{(groupedModels[provider] ?? []).map((m) => {
									const proModel = isProModel(m.id);
									const disabledByPlan = !isPro && proModel;
									const isSelected = selectedModelId === m.id;
									const caps = getCapabilities(m.id);

									return (
										<ModelSelectorItem
											key={m.id}
											disabled={disabledByPlan}
											onSelect={() => {
												if (disabledByPlan) return;
												onModelSelect(m.id);
											}}
											value={m.name}
											className={cn(
												"group relative flex h-full flex-col gap-2.5 rounded-2xl px-4 py-3.5 cursor-pointer text-left transition-all duration-200",
												"bg-card/40 sm:bg-foreground/[0.02] backdrop-blur-xl ring-1 ring-foreground/8",
												"hover:-translate-y-0.5 hover:bg-foreground/[0.04] hover:ring-foreground/15 hover:shadow-[0_16px_38px_-20px_color-mix(in_oklch,black_55%,transparent)]",
												isSelected &&
													"glow-rail bg-primary/[0.06] ring-primary/40 shadow-[0_0_24px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent)] hover:bg-primary/10 hover:ring-primary/50",
												disabledByPlan &&
													"opacity-45 cursor-not-allowed hover:translate-y-0 hover:bg-foreground/[0.02] hover:ring-foreground/8 hover:shadow-none",
											)}
										>
											{/* Row 1: logo + name + selection */}
											<div className="flex items-center gap-3">
												<span
													className={cn(
														"flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]",
														isSelected
															? "bg-primary/20 ring-1 ring-primary/30"
															: "bg-foreground/5 ring-1 ring-foreground/10 group-hover:bg-foreground/10",
													)}
												>
													<ModelSelectorLogo
														provider={m.provider}
														className="size-[18px]"
													/>
												</span>

												<div className="flex min-w-0 flex-1 items-center gap-1.5">
													<ModelSelectorName
														className={cn(
															"truncate text-[14px]",
															isSelected
																? "font-semibold text-foreground"
																: "font-medium text-foreground",
														)}
													>
														{m.name}
													</ModelSelectorName>
													{proModel && (
														<PremiumModelBadge className="shrink-0" />
													)}
												</div>

												<span
													className={cn(
														"flex size-5 shrink-0 items-center justify-center rounded-full transition-all duration-200",
														isSelected
															? "scale-100 bg-primary text-primary-foreground shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
															: "scale-75 opacity-0",
													)}
												>
													<CheckIcon className="size-3" strokeWidth={3} />
												</span>
											</div>

											{/* Description */}
											<p className="line-clamp-2 min-h-[2.4em] text-[12.5px] leading-relaxed text-muted-foreground/80">
												{m.description || "A powerful AI model."}
											</p>

											{/* Capability strip */}
											{caps.length > 0 && (
												<div className="mt-auto flex items-center gap-2 border-t border-foreground/8 pt-2.5">
													<ModelCapabilityIcons
														capabilities={caps}
														className="opacity-70"
													/>
												</div>
											)}
										</ModelSelectorItem>
									);
								})}
							</div>
						</ModelSelectorGroup>
					))}
				</ModelSelectorList>
			</div>
		</div>
	);
}
