import React, { useState, useMemo } from "react";
import {
  Search,
  Star,
  Check,
  Lock,
  X,
  Zap,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import type { ModelOption } from "@repo/ai/lib/models";
import {
  KODE_MODELS,
  canUseFastMode,
  getDefaultKodeModel,
  getKodeModelAccess,
  minimumKodePlan,
  type KodeModelOption,
  type KodePlan,
} from "@repo/ai/lib/kode";
import { kodeUsageMultiplier } from "@repo/ai/lib/kode-usage";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Switch } from "@/components/ui/switch";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { useByokProviders, canUseByokModel } from "@/lib/kode-byok";
import {
  cliLoginCommand,
  cliNeedsLogin,
  cliPlanLabel,
  cliVersionIssue,
  getProvider,
  parseCliModelId,
  useCliProviders,
  type CliModelOption,
} from "@/lib/kode-cli";

export type AnyModelOption = ModelOption | KodeModelOption | CliModelOption;


interface ModelPickerProps {
  selectedModelId: string;
  onSelectModel: (model: AnyModelOption) => void;
  models?: AnyModelOption[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenSettings?: () => void;
  /** Kode surface: show plan locks, usage multipliers and Fast mode. */
  kodePlan?: KodePlan;
}

export function ModelPickerPopover({
  selectedModelId,
  onSelectModel,
  models,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onOpenSettings,
  kodePlan,
}: ModelPickerProps) {
  const { kodeFastMode } = useAppSettings();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setUncontrolledOpen;

  const modelList = useMemo(() => {
    const base = models ?? KODE_MODELS;
    return base.filter((m) => {
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
      const next = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem("kontinue.favorite-models", JSON.stringify(next));
      return next;
    });
  };

  const providers = useMemo(() => {
    return Array.from(new Set(modelList.map((m) => m.provider)));
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
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(m);
        continue;
      }
      if (kodePlan && "tier" in m) {
        const label = TIER_LABEL[m.tier];
        if (!map.has(label)) map.set(label, []);
        map.get(label)!.push(m);
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
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(m);
    }
    return Array.from(map.entries());
  }, [filteredModels, kodePlan]);


  const selectedModel = useMemo(
    () => modelList.find((m) => m.id === selectedModelId) ?? modelList[0],
    [modelList, selectedModelId]
  );
  const kodeBase = getDefaultKodeModel();
  const selectedKode =
    kodePlan && selectedModel && "tier" in selectedModel ? selectedModel : null;
  const fastAvailable = !!selectedKode && !!kodePlan && canUseFastMode(selectedKode, kodePlan);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80 cursor-pointer select-none"
          >
            <ProviderIcon provider={selectedModel?.provider} className="size-3.5" />
            <span className="font-medium text-foreground">{selectedModel?.name ?? "Select model"}</span>
            <ChevronDown size={11} className="text-muted-foreground ml-0.5" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[380px] p-0 liquid-glass-dropdown text-foreground overflow-hidden select-none"
      >
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
            <FilterChip
              active={activeProvider === "favorites"}
              onClick={() => setActiveProvider("favorites")}
              title="Favorites"
            >
              <Star
                size={12}
                className={activeProvider === "favorites" ? "fill-purple-500 text-purple-500" : ""}
              />
            </FilterChip>
            <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
            {providers.map((p) => (
              <FilterChip
                key={p}
                active={activeProvider === p}
                onClick={() => setActiveProvider(p)}
                title={p}
                icon
              >
                <ProviderIcon provider={p} className="size-3.5" />
              </FilterChip>
            ))}
          </div>

          {/* Model list */}
          <TooltipPrimitive.Provider delayDuration={450} skipDelayDuration={150}>
          <div className="flex-1 space-y-2 overflow-y-auto border-t border-border px-1.5 pt-1.5 pb-2">
            {filteredModels.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No models found
              </div>
            ) : (
              groups.map(([groupName, groupModels]) => (
                <div key={groupName}>
                  <p className="px-3 pt-1.5 pb-1 text-[10.5px] font-medium text-muted-foreground/70">
                    {groupName}
                  </p>
                  {groupModels.map((model) => {
                    const isSelected = selectedModelId === model.id;
                    const isFav = favorites.includes(model.id);
                    const isByok = canUseByokModel(model.id, byokProviders);
                    const kodeModel = kodePlan && "tier" in model ? model : null;
                    // Settings → Providers: runs through the user's own Claude
                    // Code / Codex CLI, so Kode's plan locks and usage don't apply.
                    const cli = parseCliModelId(model.id);
                    const cliProvider = cli ? getProvider(cli.instanceId) ?? null : null;
                    const versionIssue =
                      cli && cliProvider ? cliVersionIssue(cli.model, cliProvider, cliStatuses) : null;
                    const accent = "accent" in model ? model.accent : null;
                    const loginCommand = cliProvider ? cliLoginCommand(cliProvider) : null;
                    const access =
                      kodeModel && kodePlan ? getKodeModelAccess(kodeModel, kodePlan) : "included";
                    // A personal API key unlocks a model regardless of plan.
                    const locked = access === "locked" && !isByok;
                    const multiplier =
                      kodeModel && kodeModel.id !== kodeBase.id
                        ? kodeUsageMultiplier(kodeModel, kodeBase)
                        : null;

                    return (
                      <TooltipPrimitive.Root key={model.id}>
                      <TooltipPrimitive.Trigger asChild>
                      <div
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          if (locked) {
                            void openUrl("https://chat.kontinueai.com/pricing").catch(() =>
                              window.open("https://chat.kontinueai.com/pricing", "_blank"),
                            );
                            return;
                          }
                          onSelectModel(model);
                          setOpen(false);
                        }}
                        className={cn(
                          "group flex cursor-pointer items-center gap-2.5 rounded-full px-3 py-1.5 transition-colors",
                          isSelected
                            ? "kontinue-menu-active"
                            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                          locked && "opacity-55"
                        )}
                      >
                        <span className="relative shrink-0">
                          <ProviderIcon provider={model.provider} className="size-4" />
                          {accent ? (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-background"
                              style={{ backgroundColor: accent }}
                            />
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-foreground">
                              {model.name}
                            </span>
                            {cliProvider && versionIssue ? (
                              <span
                                title={versionIssue}
                                className="rounded-full bg-amber-500/15 px-1.5 text-[8.5px] font-semibold uppercase text-amber-600 dark:text-amber-400"
                              >
                                Update CLI
                              </span>
                            ) : cliProvider && cliNeedsLogin(cliStatuses, cliProvider.id) ? (
                              <span
                                title={
                                  loginCommand
                                    ? `Sign in from Settings → Providers, or run "${loginCommand}" in a terminal.`
                                    : "Sign in from Settings → Providers."
                                }
                                className="rounded-full bg-amber-500/15 px-1.5 text-[8.5px] font-semibold uppercase text-amber-600 dark:text-amber-400"
                              >
                                Sign in
                              </span>
                            ) : cliProvider && (
                              <span
                                title={`Runs through ${cliProvider.label} on this computer. ${cliPlanLabel(cliProvider)}, not counted in Kode usage.`}
                                className="rounded-full bg-emerald-500/15 px-1.5 text-[8.5px] font-semibold uppercase text-emerald-600 dark:text-emerald-400"
                              >
                                Your plan
                              </span>
                            )}
                            {isByok && (
                              <span className="rounded-full bg-emerald-500/15 px-1.5 text-[8.5px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                                BYOK
                              </span>
                            )}
                            {locked && kodeModel ? (
                              <span className="flex items-center gap-0.5 rounded-full border border-purple-500/30 px-1.5 text-[9px] font-semibold text-purple-500 dark:text-purple-300">
                                <Lock size={8} />
                                {PLAN_LABEL[minimumKodePlan(kodeModel)]}
                              </span>
                            ) : null}
                            {access === "credits" && !isByok ? (
                              <span className="rounded-full border border-amber-500/30 px-1.5 text-[9px] font-semibold text-amber-500">
                                Extra usage
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[10.5px] leading-tight text-muted-foreground">
                            {model.description || `${model.provider} model`}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                          onClick={(e) => toggleFavorite(e, model.id)}
                          className={cn(
                            "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity",
                            isFav
                              ? "text-purple-500"
                              : "text-muted-foreground/50 opacity-0 hover:text-foreground group-hover:opacity-100"
                          )}
                        >
                          <Star size={11} className={isFav ? "fill-purple-500" : ""} />
                        </button>
                        {multiplier !== null ? (
                          <span
                            title="Usage per request compared with Kode 1.0"
                            className="shrink-0 font-mono text-[10px] text-muted-foreground/70"
                          >
                            {formatMultiplier(multiplier)}
                          </span>
                        ) : null}
                        {isSelected ? (
                          <Check size={13} className="shrink-0 text-purple-500" />
                        ) : (
                          <span className="size-[13px] shrink-0" />
                        )}
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
                          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                            {model.description || `${model.provider} model`}
                          </p>
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
                <p className="text-[12px] font-medium text-foreground">Fast mode</p>
                <p className="truncate text-[10.5px] text-muted-foreground">
                  {kodePlan !== "pro" && kodePlan !== "max"
                    ? "Available on Pro and Max."
                    : selectedKode?.fast
                      ? "About 2× faster output, uses about 2× usage."
                      : `Not available for ${selectedModel?.name ?? "this model"}.`}
                </p>
              </div>
              <Switch
                checked={fastAvailable && kodeFastMode}
                disabled={!fastAvailable}
                onCheckedChange={(checked) => updateSettings({ kodeFastMode: checked })}
              />
            </div>
          ) : null}

          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex shrink-0 cursor-pointer items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
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

export function ModelSelectorLogo({
  provider,
  className,
}: {
  provider?: string;
  className?: string;
}) {
  const p = (provider || "kontinue").toLowerCase();
  const [imgFailed, setImgFailed] = useState(false);
  const src =
    p === "kontinue"
      ? "/kontinueai-icon.png"
      : `https://models.dev/logos/${p}.svg`;

  if (!imgFailed) {
    return (
      <img
        src={src}
        alt={`${p} logo`}
        onError={() => setImgFailed(true)}
        className={cn(
          "size-3.5 object-contain",
          p === "kontinue" ? "brightness-0 dark:invert" : "dark:invert",
          className
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid size-3.5 place-items-center rounded bg-purple-500/20 font-semibold text-[8px] text-purple-300 ring-1 ring-purple-500/30",
        className
      )}
    >
      {p.slice(0, 2).toUpperCase()}
    </span>
  );
}

const ProviderIcon = ModelSelectorLogo;

const TIER_LABEL: Record<KodeModelOption["tier"], string> = {
  light: "Light",
  standard: "Standard",
  frontier: "Frontier",
  ultra: "Ultra",
};

const PLAN_LABEL: Record<KodePlan, string> = {
  free: "Free",
  starter: "Starter",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
};

function formatMultiplier(value: number): string {
  if (value < 0.95) return `${value.toFixed(1)}×`;
  return value < 10 ? `${value.toFixed(1).replace(/\.0$/, "")}×` : `${Math.round(value)}×`;
}

function FilterChip({
  active,
  onClick,
  title,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  icon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs transition-colors",
        icon ? "w-7" : "px-3",
        active
          ? "kontinue-menu-active font-medium"
          : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
        icon && !active && "opacity-60 hover:opacity-100"
      )}
    >
      {children}
    </button>
  );
}

export default ModelPickerPopover;
