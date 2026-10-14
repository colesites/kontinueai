import React, { useState, useMemo } from "react";
import {
  Search,
  Star,
  Sparkles,
  X,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ModelOption } from "@repo/ai/lib/models";
import { KODE_MODELS, type KodeModelOption } from "@repo/ai/lib/kode";
import { useByokProviders, canUseByokModel } from "@/lib/kode-byok";

export type AnyModelOption = ModelOption | KodeModelOption;


interface ModelPickerProps {
  selectedModelId: string;
  onSelectModel: (model: AnyModelOption) => void;
  models?: AnyModelOption[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenSettings?: () => void;
}

export function ModelPickerPopover({
  selectedModelId,
  onSelectModel,
  models,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onOpenSettings,
}: ModelPickerProps) {
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
  }, [filteredModels]);

  const selectedModel = useMemo(
    () => modelList.find((m) => m.id === selectedModelId) ?? modelList[0],
    [modelList, selectedModelId]
  );

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

      {/* Floating Model Picker Box with liquid glass styling */}
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[410px] p-0 rounded-[22px] liquid-glass-dropdown text-foreground overflow-hidden select-none"
      >
        <div className="flex h-[400px] w-full">
          {/* Left Vertical Provider Icon Rail */}
          <aside className="w-11 shrink-0 border-r border-border bg-muted/30 dark:bg-white/[0.015] flex flex-col items-center py-2.5 gap-1.5">
            <button
              type="button"
              title="Favorites"
              onClick={() => setActiveProvider("favorites")}
              className={cn(
                "size-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                activeProvider === "favorites"
                  ? "bg-purple-600/30 text-purple-700 dark:text-purple-300 border border-purple-500/40 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Star size={13} className={activeProvider === "favorites" ? "fill-purple-600 dark:fill-purple-400 text-purple-600 dark:text-purple-400" : ""} />
            </button>

            <button
              type="button"
              title="All Models"
              onClick={() => setActiveProvider("all")}
              className={cn(
                "size-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                activeProvider === "all"
                  ? "bg-purple-600/30 text-purple-700 dark:text-purple-300 border border-purple-500/40 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Sparkles size={13} />
            </button>

            <div className="w-5 h-px bg-border my-0.5" />

            {/* Provider Icons */}
            <div className="flex-1 overflow-y-auto space-y-1.5 w-full flex flex-col items-center">
              {providers.map((p) => {
                const isActive = activeProvider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    title={p}
                    onClick={() => setActiveProvider(p)}
                    className={cn(
                      "size-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                      isActive
                        ? "bg-purple-600/30 border border-purple-500/40 shadow-xs text-purple-700 dark:text-purple-200"
                        : "opacity-50 hover:opacity-100 hover:bg-secondary dark:hover:bg-white/[0.06]"
                    )}
                  >
                    <ProviderIcon provider={p} className="size-3.5" />
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* Search Header */}
            <div className="p-2 border-b border-border flex items-center gap-2">
              <Search size={13} className="text-muted-foreground ml-1 shrink-0" />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Models Scrollable List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
              {filteredModels.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No models found
                </div>
              ) : (
                groups.map(([groupName, groupModels]) => (
                  <div key={groupName} className="space-y-0.5">
                    <div className="px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground flex items-center justify-between">
                      <span>{groupName}</span>
                      <span className="text-[9.5px] opacity-60 font-mono">{groupModels.length}</span>
                    </div>

                    <div className="space-y-0.5">
                      {groupModels.map((model, idx) => {
                        const isSelected = selectedModelId === model.id;
                        const isFav = favorites.includes(model.id);
                        const isByok = canUseByokModel(model.id, byokProviders);

                        return (
                          <div
                            key={model.id}
                            onClick={() => {
                              onSelectModel(model);
                              setOpen(false);
                            }}
                            className={cn(
                              "group relative flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition-all cursor-pointer",
                              isSelected
                                ? "bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-200"
                                : "border border-transparent hover:bg-secondary/60 dark:hover:bg-white/[0.04] text-foreground/80 hover:text-foreground"
                            )}
                          >
                            {/* Active Purple Indicator Bar on Left */}
                            {isSelected && (
                              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                            )}

                            <div className="flex min-w-0 flex-1 items-start gap-2 pl-1">
                              <div className="mt-0.5 size-3.5 shrink-0">
                                <ProviderIcon provider={model.provider} className="size-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium truncate text-foreground">
                                    {model.name}
                                  </span>
                                  {isByok && (
                                    <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.2 text-[8px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
                                      BYOK
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                                  {model.description || `${model.provider} model`}
                                </p>
                              </div>
                            </div>

                            {/* Right Actions: Shortcut Hint + Star */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {idx < 4 && activeProvider === "all" && !search && (
                                <span className="font-mono text-[9.5px] text-muted-foreground/60 hidden group-hover:block">
                                  ⌘{idx + 1}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => toggleFavorite(e, model.id)}
                                className={cn(
                                  "p-1 rounded transition-colors cursor-pointer",
                                  isFav
                                    ? "text-purple-600 dark:text-purple-400 fill-purple-600 dark:fill-purple-400"
                                    : "text-muted-foreground/30 hover:text-foreground opacity-0 group-hover:opacity-100"
                                )}
                              >
                                <Star size={11} className={isFav ? "fill-purple-600 dark:fill-purple-400" : ""} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Footer Note with Settings Link */}
            <div className="p-2 border-t border-border bg-muted/30 dark:bg-white/[0.015] flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Looking for custom keys?</span>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                  className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 font-medium transition-colors cursor-pointer"
                >
                  Provider settings
                  <ExternalLink size={10} />
                </button>
              )}
            </div>
          </main>
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

export default ModelPickerPopover;
