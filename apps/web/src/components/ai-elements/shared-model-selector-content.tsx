import { useState, useMemo } from "react";
import { CheckIcon, LayoutGridIcon } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import {
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorLogo,
  ModelSelectorName,
} from "./model-selector";
import { PremiumModelBadge } from "./premium-model-badge";
import { ModelCapabilityIcons } from "./model-capability-icons";
import { AVAILABLE_MODELS } from "@repo/ai/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { useIsProPlan } from "../../lib/use-plan-tier";

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
        const list = (acc[m.provider] ??= []);
        list.push(m);
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
                <ModelSelectorLogo
                  provider={provider}
                  className="size-3"
                />
              </span>
              <span className="capitalize hidden sm:inline truncate">{provider}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 pb-2">
                {(groupedModels[provider] ?? []).map((m, idx, arr) => {
                  const proModel = isProModel(m.id);
                  const disabledByPlan = !isPro && proModel;
                  const isSelected = selectedModelId === m.id;

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
                        "group relative flex flex-col items-start text-left gap-3 px-4 py-4 cursor-pointer transition-all duration-200 rounded-2xl",
                        "bg-background/60 sm:bg-transparent backdrop-blur-2xl border border-foreground/10 shadow-[0_0_15px_-5px_color-mix(in_oklch,var(--foreground)_20%,transparent)]",
                        "hover:border-foreground/20 hover:shadow-[0_0_25px_-5px_color-mix(in_oklch,var(--foreground)_30%,transparent)] hover:-translate-y-[2px]",
                        isSelected &&
                          "bg-primary/5 border-primary/40 shadow-[0_0_30px_-5px_var(--primary)] hover:bg-primary/10 hover:border-primary/50",
                        disabledByPlan && "opacity-45 cursor-not-allowed hover:bg-transparent hover:border-foreground/10 hover:shadow-[0_0_15px_-5px_color-mix(in_oklch,var(--foreground)_20%,transparent)] hover:translate-y-0",
                      )}
                    >
                      {/* Top row: Logo + Selection status */}
                      <div className="flex w-full items-start justify-between">
                        <span
                          className={cn(
                            "flex items-center justify-center size-10 rounded-xl shrink-0 transition-colors shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_10%,transparent)]",
                            isSelected
                              ? "bg-primary/20 border border-primary/30"
                              : "bg-foreground/5 border border-foreground/10",
                          )}
                        >
                          <ModelSelectorLogo provider={m.provider} className="size-5" />
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          <ModelCapabilityIcons
                            className={cn(
                              "hidden md:flex transition-opacity duration-150",
                              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-90",
                            )}
                            capabilities={getCapabilities(m.id)}
                          />
                          <span
                            className={cn(
                              "flex items-center justify-center size-5 rounded-full transition-all duration-200",
                              isSelected
                                ? "bg-primary text-primary-foreground shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent)] scale-100"
                                : "scale-75 opacity-0",
                            )}
                          >
                            <CheckIcon className="size-3" strokeWidth={3} />
                          </span>
                        </div>
                      </div>

                      {/* Bottom row: Name + description */}
                      <div className="flex flex-col min-w-0 w-full gap-1 mt-1">
                        <div className="flex items-center gap-1.5">
                          <ModelSelectorName
                            className={cn(
                              "text-[14.5px] truncate",
                              isSelected ? "text-foreground font-semibold" : "text-foreground font-medium",
                            )}
                          >
                            {m.name}
                          </ModelSelectorName>
                          {proModel && <PremiumModelBadge className="shrink-0" />}
                        </div>
                        <p className="text-[12.5px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                          {m.description || "A powerful AI model."}
                        </p>
                      </div>
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
