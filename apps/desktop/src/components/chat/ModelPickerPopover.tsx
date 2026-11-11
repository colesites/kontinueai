import { canUseFastMode, getDefaultKodeModel, getKodeModelAccess, KODE_MODELS, type KodeModelOption, type KodePlan, minimumKodePlan } from "@repo/ai/lib/kode";
import { kodeUsageMultiplier } from "@repo/ai/lib/kode-usage";
import type { ModelOption } from "@repo/ai/lib/models";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronDown, ExternalLink, Lock, Search, Star, X, Zap } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type React from "react";
import { useMemo, useState } from "react";
import { updateSettings, useAppSettings } from "../../lib/app-settings";
import { canUseByokModel, useByokProviders } from "../../lib/kode-byok";
import { type CliModelOption, cliLoginCommand, cliNeedsLogin, cliPlanLabel, cliVersionIssue, getProvider, parseCliModelId, useCliProviders } from "../../lib/kode-cli";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";

export type AnyModelOption = ModelOption | KodeModelOption | CliModelOption;

interface ModelPickerProps {
  selectedModelId: string;
  onSelectModel: (model: AnyModelOption) => void;
  models?: AnyModelOption[];
  trigger?: React.ReactNode;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenSettings?: () => void;
  /** Kode surface: show plan locks, usage multipliers and Fast mode. */
  kodePlan?: KodePlan;
  side?: "top" | "bottom";
  align?: "start" | "end";
}

export function ModelPickerPopover({
  selectedModelId,
  onSelectModel,
  models,
  trigger,
  triggerClassName,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onOpenSettings,
  kodePlan,
  side = "top",
  align = "start",
}: ModelPickerProps) {
  const { kodeFastMode } = useAppSettings();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setUncontrolledOpen;

  const modelList = useMemo(() => {
    const base = models ?? KODE_MODELS;
    return sortByProvider(base).filter((m) => {
      // Filter out realtime / live voice models in desktop app
      if ("modality" in m && m.modality === "realtime") return false;
      const lower = m.id.toLowerCase();
      if (lower.includes("realtime") || lower.includes("-live") || lower.endsWith("/live")) {
        return false;
      }
      return true;
    });
  }, [models]);

  const [activeProvider, setActiveProvider] = useState<string | "all" | "favorites">("all");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("kontinue.favorite-models");
      return stored ? JSON.parse(stored) : ["kontinue/kode-1.0", "k-ai-1.0", "anthropic/claude-3-7-sonnet", "openai/gpt-4o"];
    } catch {
      return ["kontinue/kode-1.0", "k-ai-1.0"];
    }
  });

  const byokProviders = useByokProviders();
  const cliStatuses = useCliProviders();

  const toggleFavorite = (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId];
      localStorage.setItem("kontinue.favorite-models", JSON.stringify(next));
      return next;
    });
  };

  const providers = useMemo(() => {
    // Ranked on their own: your agents' models list last, but their icons
    // (Claude Code shares Anthropic's, Cursor gets its own) take their lab's place.
    return Array.from(new Set(modelList.map((m) => m.provider))).sort((a, b) => labRank(a) - labRank(b));
  }, [modelList]);

  const filteredModels = useMemo(() => {
    return modelList.filter((model) => {
      if (activeProvider === "favorites" && !favorites.includes(model.id)) {
        return false;
      }
      if (activeProvider !== "all" && activeProvider !== "favorites" && model.provider !== activeProvider) {
        return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchName = model.name.toLowerCase().includes(query);
        const matchProvider = model.provider.toLowerCase().includes(query);
        const matchDesc = model.description?.toLowerCase().includes(query);
        return matchName || matchProvider || matchDesc;
      }
      return true;
    });
  }, [modelList, activeProvider, search, favorites]);

  // Group filtered models by provider or category
  const groups = useMemo(() => {
    const map = new Map<string, AnyModelOption[]>();
    for (const m of filteredModels) {
      // Models from the user's own agents (Settings → Providers), one group
      // per provider instance.
      const cli = parseCliModelId(m.id);
      if (cli) {
        const label = ("group" in m && m.group) || getProvider(cli.instanceId)?.label || cli.instanceId;
        pushGroup(map, label, m);
        continue;
      }
      if (kodePlan && "tier" in m && typeof m.tier === "string") {
        const label = TIER_LABEL[m.tier as KodeModelOption["tier"]];
        pushGroup(map, label, m);
        continue;
      }
      const groupName =
        m.provider === "kontinue"
          ? "Primary Models"
          : m.provider === "anthropic"
            ? "Anthropic Claude"
            : m.provider === "openai"
              ? "OpenAI"
              : m.provider === "deepseek"
                ? "DeepSeek"
                : m.provider === "google"
                  ? "Google Gemini"
                  : m.provider === "xai"
                    ? "xAI Grok"
                    : m.provider === "minimax"
                      ? "MiniMax"
                      : m.provider === "zai"
                        ? "Z.ai"
                        : m.provider === "alibaba"
                          ? "Alibaba Qwen"
                          : m.provider === "mistral"
                            ? "Mistral AI"
                            : m.provider === "perplexity"
                              ? "Perplexity"
                              : "Other Providers";
      pushGroup(map, groupName, m);
    }
    const entries = Array.from(map.entries());
    // Kode groups are tiers: always lightest to heaviest, whichever provider comes first.
    if (kodePlan) entries.sort(([a], [b]) => tierRank(a) - tierRank(b));
    return entries;
  }, [filteredModels, kodePlan]);

  const selectedModel = useMemo(() => modelList.find((m) => m.id === selectedModelId) ?? modelList[0], [modelList, selectedModelId]);
  const kodeBase = getDefaultKodeModel();
  const selectedKode = kodePlan && selectedModel && "tier" in selectedModel ? selectedModel : null;
  const fastAvailable = !!selectedKode && !!kodePlan && canUseFastMode(selectedKode, kodePlan);

  const chooseModel = (model: AnyModelOption, locked: boolean) => {
    if (locked) {
      void openUrl("https://chat.kontinueai.com/pricing").catch(() => window.open("https://chat.kontinueai.com/pricing", "_blank"));
      return;
    }
    onSelectModel(model);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <button
            type="button"
            className={cn("flex h-7 items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80 cursor-pointer select-none", triggerClassName)}
          >
            <ProviderIcon provider={selectedModel?.provider} className="size-3.5" />
            <span className="font-medium text-foreground">{selectedModel?.name ?? "Select model"}</span>
            <ChevronDown size={11} className="text-muted-foreground ml-0.5" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent align={align} side={side} sideOffset={8} className="w-[380px] p-0 liquid-glass-dropdown text-foreground overflow-hidden select-none">
        <div className="flex h-[420px] w-full flex-col">
          {/* Search */}
          <div className="px-2.5 pt-2.5">
            <div className="kontinue-3d flex h-8 items-center gap-2 rounded-full px-3">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search models"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                // biome-ignore lint/a11y/noAutofocus: the search field should take focus when the picker opens
                autoFocus
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Filters: All, Favorites, then one chip per provider */}
          <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto px-2.5 py-2">
            <FilterChip active={activeProvider === "all"} onClick={() => setActiveProvider("all")}>
              All
            </FilterChip>
            <FilterChip active={activeProvider === "favorites"} onClick={() => setActiveProvider("favorites")} title="Favorites">
              <Star size={12} className={activeProvider === "favorites" ? "fill-purple-500 text-purple-500" : ""} />
            </FilterChip>
            <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
            {providers.map((p) => (
              <FilterChip key={p} active={activeProvider === p} onClick={() => setActiveProvider(p)} title={p} icon>
                <ProviderIcon provider={p} className="size-3.5" />
              </FilterChip>
            ))}
          </div>

          {/* Model list */}
          <TooltipPrimitive.Provider delayDuration={450} skipDelayDuration={150}>
            <div className="flex-1 space-y-2 overflow-y-auto border-t border-border px-1.5 pt-1.5 pb-2">
              {filteredModels.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">No models found</div>
              ) : (
                groups.map(([groupName, groupModels]) => (
                  <div key={groupName}>
                    <p className="px-3 pt-1.5 pb-1 text-caption font-medium text-muted-foreground/70">{groupName}</p>
                    {groupModels.map((model) => {
                      const isSelected = selectedModelId === model.id;
                      const isFav = favorites.includes(model.id);
                      const isByok = canUseByokModel(model.id, byokProviders);
                      const kodeModel = kodePlan && "tier" in model ? model : null;
                      // Settings → Providers: runs through the user's own Claude
                      // Code / Codex CLI, so Kode's plan locks and usage don't apply.
                      const cli = parseCliModelId(model.id);
                      const cliProvider = cli ? (getProvider(cli.instanceId) ?? null) : null;
                      const versionIssue = cli && cliProvider ? cliVersionIssue(cli.model, cliProvider, cliStatuses) : null;
                      const accent = "accent" in model ? model.accent : null;
                      const loginCommand = cliProvider ? cliLoginCommand(cliProvider) : null;
                      const access = kodeModel && kodePlan ? getKodeModelAccess(kodeModel, kodePlan) : "included";
                      // A personal API key unlocks a model regardless of plan.
                      const locked = access === "locked" && !isByok;
                      const multiplier = kodeModel && kodeModel.id !== kodeBase.id ? kodeUsageMultiplier(kodeModel, kodeBase) : null;

                      return (
                        <TooltipPrimitive.Root key={model.id}>
                          <TooltipPrimitive.Trigger asChild>
                            <div
                              role="option"
                              aria-selected={isSelected}
                              tabIndex={0}
                              onClick={() => chooseModel(model, locked)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                chooseModel(model, locked);
                              }}
                              className={cn(
                                "group flex cursor-pointer items-center gap-2.5 rounded-full px-3 py-1.5 transition-colors",
                                isSelected ? "kontinue-menu-active" : "kontinue-hover",
                                locked && "opacity-55",
                              )}
                            >
                              <span className="relative shrink-0">
                                <ProviderIcon provider={model.provider} className="size-4" />
                                {accent ? <span className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-background" style={{ backgroundColor: accent }} /> : null}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-medium text-foreground">{model.name}</span>
                                  {cliProvider && versionIssue ? (
                                    <span title={versionIssue} className="rounded-full bg-amber-500/15 px-1.5 text-micro font-semibold uppercase text-amber-600 dark:text-amber-400">
                                      Update CLI
                                    </span>
                                  ) : cliProvider && cliNeedsLogin(cliStatuses, cliProvider.id) ? (
                                    <span
                                      title={loginCommand ? `Sign in from Settings → Providers, or run "${loginCommand}" in a terminal.` : "Sign in from Settings → Providers."}
                                      className="rounded-full bg-amber-500/15 px-1.5 text-micro font-semibold uppercase text-amber-600 dark:text-amber-400"
                                    >
                                      Sign in
                                    </span>
                                  ) : (
                                    cliProvider && (
                                      <span
                                        title={`Runs through ${cliProvider.label} on this computer. ${cliPlanLabel(cliProvider)}, not counted in Kode usage.`}
                                        className="rounded-full bg-emerald-500/15 px-1.5 text-micro font-semibold uppercase text-emerald-600 dark:text-emerald-400"
                                      >
                                        Your plan
                                      </span>
                                    )
                                  )}
                                  {isByok && <span className="rounded-full bg-emerald-500/15 px-1.5 text-micro font-semibold uppercase text-emerald-600 dark:text-emerald-400">BYOK</span>}
                                  {locked && kodeModel ? (
                                    <span className="flex items-center gap-0.5 rounded-full border border-purple-500/30 px-1.5 text-micro font-semibold text-purple-500 dark:text-purple-300">
                                      <Lock size={8} />
                                      {PLAN_LABEL[minimumKodePlan(kodeModel)]}
                                    </span>
                                  ) : null}
                                  {access === "credits" && !isByok ? <span className="rounded-full border border-amber-500/30 px-1.5 text-micro font-semibold text-amber-500">Extra usage</span> : null}
                                </div>
                                <p className="truncate text-caption leading-tight text-muted-foreground">{model.description || `${model.provider} model`}</p>
                              </div>
                              <button
                                type="button"
                                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                                onClick={(e) => toggleFavorite(e, model.id)}
                                className={cn(
                                  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity",
                                  isFav ? "text-purple-500" : "text-muted-foreground/50 opacity-0 hover:text-foreground group-hover:opacity-100",
                                )}
                              >
                                <Star size={11} className={isFav ? "fill-purple-500" : ""} />
                              </button>
                              {multiplier !== null ? (
                                <span title="Usage per request compared with Kode 1.0" className="shrink-0 font-mono text-micro text-muted-foreground/70">
                                  {formatMultiplier(multiplier)}
                                </span>
                              ) : null}
                              {isSelected ? <Check size={13} className="shrink-0 text-purple-500" /> : <span className="size-[13px] shrink-0" />}
                            </div>
                          </TooltipPrimitive.Trigger>
                          <TooltipPrimitive.Portal>
                            <TooltipPrimitive.Content
                              side="right"
                              align="center"
                              sideOffset={16}
                              collisionPadding={12}
                              className="liquid-glass-dropdown z-50 w-64 px-3.5 py-3 text-foreground animate-in fade-in-0 zoom-in-95"
                            >
                              <div className="flex items-center gap-2">
                                <ProviderIcon provider={model.provider} className="size-3.5 shrink-0" />
                                <p className="truncate text-xs font-semibold">{model.name}</p>
                              </div>
                              <p className="mt-1.5 text-label leading-relaxed text-muted-foreground">{model.description || `${model.provider} model`}</p>
                            </TooltipPrimitive.Content>
                          </TooltipPrimitive.Portal>
                        </TooltipPrimitive.Root>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </TooltipPrimitive.Provider>

          {kodePlan ? (
            <div className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-2.5">
              <Zap size={13} className={cn("shrink-0", fastAvailable && kodeFastMode ? "text-amber-400" : "text-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <p className="text-label font-medium text-foreground">Fast mode</p>
                <p className="truncate text-caption text-muted-foreground">
                  {kodePlan !== "pro" && kodePlan !== "max"
                    ? "Available on Pro and Max."
                    : selectedKode?.fast
                      ? "About 2× faster output, uses about 2× usage."
                      : `Not available for ${selectedModel?.name ?? "this model"}.`}
                </p>
              </div>
              <Switch checked={fastAvailable && kodeFastMode} disabled={!fastAvailable} onCheckedChange={(checked) => updateSettings({ kodeFastMode: checked })} />
            </div>
          ) : null}

          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex shrink-0 cursor-pointer items-center justify-between border-t border-border px-4 py-2.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>Use your own API keys</span>
              <ExternalLink size={11} />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ModelSelectorLogo({ provider, className }: { provider?: string; className?: string }) {
  const p = (provider || "kontinue").toLowerCase();
  const [imgFailed, setImgFailed] = useState(false);
  // A full URL is an icon from elsewhere (ACP Registry agents).
  const isUrl = /^https?:\/\//.test(provider ?? "");
  const src = isUrl ? (provider as string) : p === "kontinue" ? "/kontinueai-icon.png" : `https://models.dev/logos/${p}.svg`;

  // Claude models show the Claude mark rather than Anthropic's wordmark.
  if (p === "anthropic") {
    return <img src="/claude-ai.svg" alt="Claude logo" className={cn("size-3.5 object-contain", className)} />;
  }

  // Logos we ship ourselves, with a light and a dark version.
  if (p === "cursor") {
    return (
      <>
        <img src="/logos/cursor-light.svg" alt="Cursor logo" className={cn("size-3.5 object-contain dark:hidden", className)} />
        <img src="/logos/cursor-dark.svg" alt="" aria-hidden className={cn("hidden size-3.5 object-contain dark:block", className)} />
      </>
    );
  }

  if (!imgFailed) {
    return <img src={src} alt={`${p} logo`} onError={() => setImgFailed(true)} className={cn("size-3.5 object-contain", p === "kontinue" ? "brightness-0 dark:invert" : "dark:invert", className)} />;
  }

  return (
    <span className={cn("grid size-3.5 place-items-center rounded bg-purple-500/20 font-semibold text-micro text-purple-300 ring-1 ring-purple-500/30", className)}>{isUrl ? "AI" : p.slice(0, 2).toUpperCase()}</span>
  );
}

const ProviderIcon = ModelSelectorLogo;

const TIER_LABEL: Record<KodeModelOption["tier"], string> = {
  light: "Light",
  standard: "Standard",
  frontier: "Frontier",
  ultra: "Ultra",
};

/** Group order for Kode tiers; groups that aren't tiers (your own agents) come after. */
function tierRank(label: string) {
  const i = Object.values(TIER_LABEL).indexOf(label);
  return i === -1 ? 100 : i;
}

/**
 * Leading labs first: our own models, then Anthropic, OpenAI, Google, xAI,
 * then the open-weight labs. Sets the order of the filter chips, the provider
 * groups (Kontinue) and the models inside each tier (Kode).
 */
const PROVIDER_RANK = [
  "kontinue",
  "anthropic",
  "openai",
  "google",
  "cursor",
  "xai",
  "deepseek",
  "moonshotai",
  "zai",
  "alibaba",
  "minimax",
  "mistral",
  "perplexity",
];

function labRank(provider: string) {
  const i = PROVIDER_RANK.indexOf(provider.toLowerCase());
  return i === -1 ? PROVIDER_RANK.length : i;
}

function providerRank(model: AnyModelOption) {
  // Models from the user's own agents stay after ours, in the order they were added.
  if (parseCliModelId(model.id)) return 1000;
  return labRank(model.provider);
}

/** Stable: models keep their own order within a provider. */
function sortByProvider<T extends AnyModelOption>(list: readonly T[]): T[] {
  return list
    .map((model, index) => ({ model, index, rank: providerRank(model) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.model);
}

const PLAN_LABEL: Record<KodePlan, string> = {
  free: "Free",
  starter: "Starter",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
};

function pushGroup(map: Map<string, AnyModelOption[]>, label: string, model: AnyModelOption) {
  const bucket = map.get(label);
  if (bucket) {
    bucket.push(model);
    return;
  }
  map.set(label, [model]);
}

function formatMultiplier(value: number): string {
  if (value < 0.95) return `${value.toFixed(1)}×`;
  return value < 10 ? `${value.toFixed(1).replace(/\.0$/, "")}×` : `${Math.round(value)}×`;
}

function FilterChip({ active, onClick, title, icon, children }: { active: boolean; onClick: () => void; title?: string; icon?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs transition-colors",
        icon ? "w-7" : "px-3",
        active ? "kontinue-menu-active font-medium" : "text-muted-foreground kontinue-hover hover:text-foreground",
        icon && !active && "opacity-60 hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}

export default ModelPickerPopover;
