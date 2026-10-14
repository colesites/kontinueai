import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Check,
  ChevronDown,
  ArrowUpRight,
  ArrowDown,
  X,
  Link2,
  SlidersHorizontal,
  Search as SearchIcon,
  LayoutGrid,
  Brain,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Copy,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RxText } from "react-icons/rx";
import { LuImagePlus, LuSaveAll, LuShare } from "react-icons/lu";
import { RiSaveLine } from "react-icons/ri";
import { IoSearch } from "react-icons/io5";
import { ImEmbed2 } from "react-icons/im";

import { useSidebar } from "@/components/ui/sidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { sendKodeChat, type KodeChatMessage, type KodeContentPart } from "@/lib/kode-chat";
import { useReasoningPreference } from "@/lib/use-reasoning-preference";
import { useUser } from "@clerk/clerk-react";
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ShareModal } from "@/components/chat/ShareModal";
import { DesktopChatTurnNavigator, type ChatTurn } from "@/components/chat/DesktopChatTurnNavigator";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";


import {
  AVAILABLE_MODELS,
  getDefaultModel,
  type ModelOption,
} from "@repo/ai/lib/models";

const DESKTOP_MODELS: ModelOption[] = AVAILABLE_MODELS.filter((m) => {
  if (m.modality === "realtime") return false;
  const lower = m.id.toLowerCase();
  return !lower.includes("realtime") && !lower.includes("-live") && !lower.endsWith("/live");
});

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

import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import type { ModelCapability } from "@repo/core/model-capabilities";

const CAPABILITY_META: Record<
  ModelCapability,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  text: { label: "Text", Icon: RxText },
  "image-generation": { label: "Image Gen", Icon: LuImagePlus },
  "implicit-caching": { label: "Implicit Caching", Icon: RiSaveLine },
  "explicit-caching": { label: "Explicit Caching", Icon: LuSaveAll },
  "web-search": { label: "Web Search", Icon: IoSearch },
  thinking: { label: "Thinking", Icon: Brain },
  embedding: { label: "Embedding", Icon: ImEmbed2 },
};



function CapabilityIcons({ capabilities }: { capabilities: ModelCapability[] }) {
  if (!capabilities || capabilities.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {capabilities.map((cap) => {
        const meta = CAPABILITY_META[cap];
        if (!meta) return null;
        const Icon = meta.Icon;
        return (
          <span
            key={cap}
            title={meta.label}
            className="text-purple-300/70 hover:text-purple-200 transition-colors cursor-pointer inline-flex items-center"
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </div>
  );
}

function ModelSelectorLogo({ provider, className }: { provider: string; className?: string }) {
  const src = provider === "kontinue"
    ? "/kontinueai-icon.png"
    : `https://models.dev/logos/${provider}.svg`;

  return (
    <img
      src={src}
      alt={provider}
      className={cn(
        "size-4 object-contain transition-all",
        provider === "kontinue" ? "brightness-0 invert" : "brightness-0 invert",
        className
      )}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function renderMessageContent(content: string | KodeContentPart[] | null): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" && "text" in part ? part.text : ""))
    .join("\n");
}

/* ── How it works modal ── */
function HowItWorksModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { num: "01", title: "Start from chat input", desc: "Type your prompt below. A new conversation opens instantly." },
    { num: "02", title: "Import when needed", desc: "Use the import button to paste a shared link in a modal." },
    { num: "03", title: "Continue naturally", desc: "Pick your model and keep going with full context." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-popover p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Get Started</p>
            <h2 className="text-xl font-semibold text-foreground">How it works</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Steps */}
        <div className="relative mt-6">
          <div className="absolute left-[18px] top-[20px] bottom-[20px] w-px bg-border" />

          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200 text-xs font-semibold shadow-xs">
                  {step.num}
                </div>
                <div className="pt-1">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Import shared link modal ── */
function ImportLinkModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");

  const detectProvider = (u: string) => {
    if (u.includes("chat.openai.com") || u.includes("chatgpt.com")) return "ChatGPT";
    if (u.includes("claude.ai")) return "Claude";
    if (u.includes("gemini.google.com")) return "Gemini";
    return "Unknown";
  };

  const provider = url.trim() ? detectProvider(url) : "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-popover p-6 shadow-2xl backdrop-blur-xl text-popover-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Import</p>
            <h2 className="text-xl font-semibold text-foreground">Continue a conversation</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mb-5">
          Paste a shared link from ChatGPT, Claude, Gemini, or any supported provider. We&apos;ll bring the messages into Kontinue.
        </p>

        {/* URL Input */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 focus-within:border-purple-500/50 transition-colors">
          <Link2 size={16} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://chat.openai.com/share/..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Detected Provider */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Detected Provider</span>
          <span className="flex items-center gap-1.5 text-xs text-foreground/80">
            <span className={`size-1.5 rounded-full ${provider === "Unknown" ? "bg-muted-foreground/40" : "bg-emerald-400"}`} />
            {provider}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!url.trim()}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-30 transition-colors cursor-pointer shadow-sm"
          >
            Import chat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Compact & Cute Choose a Model Modal matching Web App (Image 35) ── */
function ChooseModelModal({
  selectedModelId,
  onSelectModel,
  onClose,
}: {
  selectedModelId: string;
  onSelectModel: (model: ModelOption) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const { getCapabilities } = useModelCapabilities();

  // Chat models only (exclude realtime)
  const chatModels = useMemo(() => {
    return AVAILABLE_MODELS.filter((m) => m.modality !== "realtime");
  }, []);

  // Filtered by search query
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chatModels;
    return chatModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [chatModels, search]);

  // Group by provider
  const groupedModels = useMemo(() => {
    return filteredModels.reduce((acc, m) => {
      acc[m.provider] = acc[m.provider] || [];
      acc[m.provider].push(m);
      return acc;
    }, {} as Record<string, ModelOption[]>);
  }, [filteredModels]);

  const providers = useMemo(() => Object.keys(groupedModels), [groupedModels]);
  const visibleProviders = activeProvider ? [activeProvider] : providers;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex h-[550px] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-popover/90 backdrop-blur-2xl text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.06] text-white mt-0.5">
              <SlidersHorizontal size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-white sm:text-base">
                Choose a model
              </h2>
              <p className="text-[12px] text-white/50 mt-0.5">
                Find the right balance of intelligence, speed, and capability.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/40 hover:bg-white/[0.12] hover:text-white transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search Input */}
        <div className="shrink-0 border-b border-white/[0.08] px-4 py-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs focus-within:border-purple-500/40 focus-within:ring-1 focus-within:ring-purple-500/20 transition-colors">
            <SearchIcon size={14} className="text-purple-300/60 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${chatModels.length} models...`}
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/30"
            />
          </div>
        </div>

        {/* Provider Filter Tabs Bar with Logos */}
        <div className="no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.08] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setActiveProvider(null)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeProvider === null
                ? "bg-purple-600 text-white font-semibold shadow-sm"
                : "border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <LayoutGrid size={13} />
            <span>All</span>
            <span className="ml-0.5 opacity-60">{chatModels.length}</span>
          </button>

          {providers.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setActiveProvider(p)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                activeProvider === p
                  ? "bg-purple-600 text-white font-semibold shadow-sm"
                  : "border border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <ModelSelectorLogo provider={p} className="size-3.5" />
              <span>{getProviderLabel(p)}</span>
              <span className="ml-0.5 opacity-60">{groupedModels[p]?.length ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Model List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {visibleProviders.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/40">
              No matching models found. Try a provider or capability name.
            </div>
          ) : (
            visibleProviders.map((provider) => {
              const models = groupedModels[provider] ?? [];
              if (models.length === 0) return null;

              return (
                <div key={provider} className="space-y-1.5">
                  {/* Provider Header with Logo */}
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white/50 px-1 pt-0.5">
                    <ModelSelectorLogo provider={provider} className="size-3 opacity-70" />
                    <span>{getProviderLabel(provider)}</span>
                    <span className="text-[10px] text-white/30 font-normal">
                      {models.length}
                    </span>
                  </div>

                  {/* Model Cards */}
                  <div className="space-y-1">
                    {models.map((model) => {
                      const isSelected = selectedModelId === model.id;
                      const isKai = model.provider === "kontinue";
                      const caps = getCapabilities(model.id);

                      return (
                        <button
                          type="button"
                          key={model.id}
                          onClick={() => {
                            onSelectModel(model);
                            onClose();
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                            isSelected
                              ? "border-purple-500/40 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.12)]"
                              : "border-white/[0.06] bg-white/[0.025] hover:border-purple-500/25 hover:bg-white/[0.05]"
                          }`}
                        >
                          {/* Left: Icon + Info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                              <ModelSelectorLogo provider={model.provider} className="size-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white truncate">
                                  {model.name}
                                </span>
                                {isKai ? (
                                  <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-200 border border-purple-500/30">
                                    Primary
                                  </span>
                                ) : (
                                  <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300 border border-purple-500/25">
                                    Pro
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-white/40 truncate mt-0.5 leading-relaxed">
                                {model.description || "Capable AI language model."}
                              </p>
                            </div>
                          </div>

                          {/* Right: Real Capability icons + Checkmark */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:flex items-center gap-1.5">
                              <CapabilityIcons capabilities={caps} />
                            </div>

                            {/* Radio checkmark */}
                            <div
                              className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                isSelected
                                  ? "border-purple-400 bg-purple-500 text-white shadow-sm"
                                  : "border-white/20 text-transparent"
                              }`}
                            >
                              <Check size={10} strokeWidth={3} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const STARTER_PROMPTS = [
  {
    icon: "💡",
    title: "Brainstorm ideas",
    prompt: "Brainstorm innovative ideas and concepts for my upcoming product launch.",
  },
  {
    icon: "✍️",
    title: "Draft & refine",
    prompt: "Help me write a clear, compelling proposal summarizing our project goals.",
  },
  {
    icon: "🔬",
    title: "Deep research",
    prompt: "Provide a comprehensive analysis comparing the latest AI reasoning models and use cases.",
  },
  {
    icon: "📊",
    title: "Analyze & summarize",
    prompt: "Summarize key findings, takeaways, and strategic action items from our discussion.",
  },
];

export default function HomeView() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const {
    chats,
    activeChatId,
    selectChat,
    createChatRecord,
    addMessageRecord,
    togglePinChat,
    deleteChat,
    renameChat,
  } = useKodeWorkspace();
  const { user } = useUser();

  const firstName = user?.firstName || user?.fullName || "there";

  const [selectedModel, setSelectedModel] = useState<ModelOption>(() => {
    return DESKTOP_MODELS.find((m) => m.isDefault) ?? DESKTOP_MODELS[0] ?? getDefaultModel();
  });
  const { reasoningEnabled, setReasoningEnabled } = useReasoningPreference();
  const [inFlightAssistant, setInFlightAssistant] = useState<{
    content: string;
    reasoning?: string;
  } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingElapsed, setStreamingElapsed] = useState(0);
  const streamingTimerRef = useRef<number | null>(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [importLinkOpen, setImportLinkOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [connectorsModalOpen, setConnectorsModalOpen] = useState(false);

  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = useMemo(() => {
    return chats.find((c) => c.id === activeChatId) ?? null;
  }, [chats, activeChatId]);

  const isHomeChat = Boolean(
    activeChatId && chats.some((c) => c.id === activeChatId)
  );

  const dbMessages = useQuery(
    api.messages.getMessages,
    isHomeChat && activeChatId ? { chatId: activeChatId } : "skip"
  );

  const displayMessages = useMemo(() => {
    const db: KodeChatMessage[] = (dbMessages ?? []).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      createdAt: m.createdAt,
    }));
    if (inFlightAssistant) {
      return [
        ...db,
        {
          role: "assistant" as const,
          content: inFlightAssistant.content,
          reasoning: inFlightAssistant.reasoning,
        },
      ];
    }
    return db;
  }, [dbMessages, inFlightAssistant]);

  // Compute user turns for DesktopChatTurnNavigator
  const turns = useMemo<ChatTurn[]>(() => {
    const result: ChatTurn[] = [];
    displayMessages.forEach((msg, idx) => {
      if (msg.role === "user") {
        const text = renderMessageContent(msg.content).replace(/\s+/g, " ").trim();
        const preview =
          text.length > 46 ? `${text.slice(0, 46).trimEnd()}...` : text || `Prompt ${result.length + 1}`;
        result.push({ id: `turn-${idx}`, preview });
      }
    });
    return result;
  }, [displayMessages]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const shouldShowBottom = scrollHeight - scrollTop - clientHeight > 200;
    setShowScrollToBottomButton(shouldShowBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleJumpToTurn = useCallback((turnId: string) => {
    setActiveTurnId(turnId);
    const el = document.getElementById(turnId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, scrollToBottom]);

  useEffect(() => {
    if (streaming) {
      setStreamingElapsed(1);
      const start = Date.now();
      streamingTimerRef.current = window.setInterval(() => {
        setStreamingElapsed(Math.max(1, Math.floor((Date.now() - start) / 1000)));
      }, 1000);
    } else {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
      setStreamingElapsed(0);
    }
    return () => {
      if (streamingTimerRef.current) {
        clearInterval(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
    };
  }, [streaming]);

  const isPinned = activeChat ? activeChat.pinnedAt !== null : false;

  const handleTogglePin = async () => {
    if (activeChatId) {
      await togglePinChat(activeChatId, !isPinned);
    }
  };

  const handleDeleteChat = async () => {
    if (activeChatId) {
      await deleteChat(activeChatId);
    }
  };

  const handleCopyMarkdown = () => {
    const md = displayMessages
      .map((m) => {
        const role = m.role === "user" ? "**User**" : "**Assistant**";
        const content = renderMessageContent(m.content);
        return `${role}:\n${content}\n`;
      })
      .join("\n---\n\n");
    void navigator.clipboard.writeText(md);
  };

  const handleSend = async (
    text: string,
    _modelId?: string,
    _attachments?: StagedAttachment[],
    _webSearchEnabled?: boolean,
    sendReasoningEnabled?: boolean,
  ) => {
    const promptText = text.trim();
    if (!promptText || streaming) return;

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChatRecord({ title: promptText.slice(0, 50) });
      selectChat(chatId);
    }

    const userMsg: KodeChatMessage = { role: "user", content: promptText };
    // Message payload sent to backend: prior messages in display plus new user prompt
    const messagesPayload: KodeChatMessage[] = [...displayMessages, userMsg];

    // Persist user prompt to Convex DB
    await addMessageRecord({
      chatId,
      role: "user",
      content: promptText,
      model: selectedModel.id,
    });

    setStreaming(true);
    setInFlightAssistant({ content: "", reasoning: "" });

    try {
      let assistantContent = "";
      let assistantReasoning = "";

      await sendKodeChat({
        messages: messagesPayload,
        modelId: selectedModel.id,
        reasoningEnabled: sendReasoningEnabled ?? reasoningEnabled,
        onEvent: (evt) => {
          if (evt.type === "content") {
            assistantContent += evt.delta;
            setInFlightAssistant({
              content: assistantContent,
              reasoning: assistantReasoning,
            });
          } else if (evt.type === "reasoning") {
            assistantReasoning += evt.delta;
            setInFlightAssistant({
              content: assistantContent,
              reasoning: assistantReasoning,
            });
          }
        },
      });

      if (chatId) {
        await addMessageRecord({
          chatId,
          role: "assistant",
          content: assistantContent,
          model: selectedModel.id,
        });
      }
    } catch (err) {
      console.error("[HomeView] Error sending message:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (chatId) {
        await addMessageRecord({
          chatId,
          role: "assistant",
          content: `⚠️ Failed to get response from ${selectedModel.name}: ${errorMsg}`,
          model: selectedModel.id,
        });
      }
    } finally {
      setInFlightAssistant(null);
      setStreaming(false);
    }
  };

  const handleRetry = async (msgIndex?: number) => {
    if (streaming) return;
    let targetUserMsg = "";
    const list = displayMessages.slice(0, msgIndex !== undefined ? msgIndex : displayMessages.length);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === "user") {
        targetUserMsg = renderMessageContent(list[i].content);
        break;
      }
    }
    if (targetUserMsg) {
      await handleSend(targetUserMsg);
    }
  };

  const handleEdit = async (_msgIndex: number, newContent: string) => {
    if (streaming || !newContent.trim()) return;
    await handleSend(newContent.trim());
  };

  const isChatActive = Boolean(activeChatId) || displayMessages.length > 0;

  return (
    <div className="relative flex h-full w-full flex-col bg-background text-foreground overflow-hidden">
      {/* Floating Desktop Chat Turn Navigator on the Right Side */}
      {isChatActive && (
        <DesktopChatTurnNavigator
          turns={turns}
          activeTurnId={activeTurnId}
          onJumpToTurn={handleJumpToTurn}
        />
      )}

      {/* Top Header Bar when Sidebar is Collapsed */}
      {isCollapsed && <FloatingSidebarButtonGroup />}

      {/* Active Conversation View */}
      {isChatActive ? (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Seamless Header Bar with Conversation Title Dropdown & Share */}
          <div
            data-tauri-drag-region
            className={cn(
              "relative z-20 flex h-13 shrink-0 items-center justify-between px-6 bg-background",
              isCollapsed && "pl-[180px]"
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-foreground/90 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer group outline-none"
                >
                  <MessageSquare size={14} className="text-purple-400 shrink-0" />
                  <span className="truncate max-w-[280px] sm:max-w-[420px]">
                    {activeChat?.title || (displayMessages[0] ? renderMessageContent(displayMessages[0].content).slice(0, 45) : "Chat")}
                  </span>
                  <ChevronDown size={13} className="text-foreground/50 transition-transform group-hover:text-white shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-52">
                <DropdownMenuItem
                  onSelect={() => {
                    setNewTitle(activeChat?.title || "");
                    setRenameModalOpen(true);
                  }}
                >
                  <Pencil size={13.5} strokeWidth={1.25} />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleTogglePin()}>
                  {isPinned ? (
                    <>
                      <PinOff size={13.5} strokeWidth={1.25} />
                      <span>Unpin</span>
                    </>
                  ) : (
                    <>
                      <Pin size={13.5} strokeWidth={1.25} />
                      <span>Pin</span>
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyMarkdown}>
                  <Copy size={13.5} strokeWidth={1.25} />
                  <span>Copy Markdown</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void handleDeleteChat()}>
                  <Trash2 size={13.5} strokeWidth={1.25} />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="p-2 rounded-lg text-foreground/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Share chat"
            >
              <LuShare size={16} />
            </button>
          </div>

          {/* Top fade-out overlay under header */}
          <div className="pointer-events-none absolute top-13 left-0 right-0 h-8 bg-gradient-to-b from-background via-background/80 to-transparent z-10" />

          {/* Scrollable Messages Stream (Same max-w-3xl width as ChatInput) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto pt-2 pb-4 scroll-smooth"
          >
            <div className="flex flex-col gap-4 px-4 pt-4 pb-6 max-w-3xl mx-auto w-full">
              {displayMessages.map((msg, i) => {
                const textContent = renderMessageContent(msg.content);
                const isUser = msg.role === "user";
                const imageParts = Array.isArray(msg.content)
                  ? (msg.content as KodeContentPart[])
                      .filter((p) => p.type === "image_url")
                      .map((p) => (p as { type: "image_url"; image_url: { url: string } }).image_url.url)
                  : undefined;

                return (
                  <div key={i} id={`turn-${i}`}>
                    <ChatMessage
                      role={msg.role as "user" | "assistant" | "system"}
                      content={textContent}
                      reasoning={msg.reasoning}
                      createdAt={msg.createdAt}
                      images={imageParts}
                      isStreaming={streaming && i === displayMessages.length - 1 && !isUser}
                      onRetry={() => void handleRetry(i)}
                      onEdit={isUser ? (newContent) => void handleEdit(i, newContent) : undefined}
                    />
                  </div>
                );
              })}

              {streaming && (
                <div className="flex items-center gap-2 text-xs text-purple-300/80 py-2">
                  <Brain size={14} className="animate-pulse text-purple-400" />
                  <span>Thinking ({streamingElapsed}s)...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom Chat Input Bar (Same max-w-3xl width as messages) */}
          <div className="shrink-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent z-20 relative">
            {/* Scroll-to-Bottom Floating Pill (subtle purple glass styling when user scrolls up) */}
            {showScrollToBottomButton && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-purple-500/30 bg-purple-950/85 hover:bg-purple-900/90 text-purple-200 text-xs font-medium shadow-lg shadow-purple-950/50 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  title="Scroll to bottom"
                >
                  <ArrowDown size={12} className="text-purple-300" />
                  <span>Jump to latest</span>
                </button>
              </div>
            )}

            <div className="max-w-3xl mx-auto">
              <ChatInput
                loading={streaming}
                placeholder="Ask anything..."
                hideAgentMode
                models={DESKTOP_MODELS}
                modelId={selectedModel.id}
                onModelChange={(newId) => {
                  const found = DESKTOP_MODELS.find((m) => m.id === newId);
                  if (found) setSelectedModel(found);
                }}
                onOpenConnectors={() => setConnectorsModalOpen(true)}
                reasoningEnabled={reasoningEnabled}
                onReasoningToggle={setReasoningEnabled}
                onSend={(text, _m, atts, _w, r) => void handleSend(text, selectedModel.id, atts, _w, r)}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ── Centered Empty Hero View matching Web App (Image 30) ── */
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-3xl text-center space-y-6">
            {/* Kontinue AI Logo */}
            <div className="flex items-center justify-center">
              <img src="/kontinueai.svg" alt="Kontinue AI" className="h-10" />
            </div>

            {/* Personalized Greeting */}
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-white">
              How can I help you, <span className="font-bold">{firstName}</span>?
            </h1>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setHowItWorksOpen(true)}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                How does this work?
              </button>
              <button
                type="button"
                onClick={() => setImportLinkOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.15] px-3.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <ArrowUpRight size={13} />
                Import shared link
              </button>
            </div>

            {/* Centered Chat Input Box using unified ChatInput */}
            <div className="w-full max-w-3xl mx-auto pt-2 text-left">
              <ChatInput
                loading={streaming}
                placeholder="Ask anything..."
                hideAgentMode
                models={DESKTOP_MODELS}
                modelId={selectedModel.id}
                onModelChange={(newId) => {
                  const found = DESKTOP_MODELS.find((m) => m.id === newId);
                  if (found) setSelectedModel(found);
                }}
                onOpenConnectors={() => setConnectorsModalOpen(true)}
                reasoningEnabled={reasoningEnabled}
                onReasoningToggle={setReasoningEnabled}
                onSend={(text, _m, atts, _w, r) => void handleSend(text, selectedModel.id, atts, _w, r)}
              />
            </div>

            {/* Quick Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto w-full pt-2 text-left">
              {STARTER_PROMPTS.map((starter, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void handleSend(starter.prompt)}
                  className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-[#121215]/60 hover:border-purple-500/40 hover:bg-purple-500/10 p-3 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer shadow-lg backdrop-blur-xl"
                >
                  <span className="text-base select-none shrink-0 group-hover:scale-110 transition-transform">
                    {starter.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white/90 group-hover:text-purple-200 transition-colors">
                      {starter.title}
                    </p>
                    <p className="text-[11px] text-white/45 truncate mt-0.5 group-hover:text-white/60 transition-colors">
                      {starter.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        chatId={activeChatId || ""}
        chatTitle={activeChat?.title || "Conversation"}
      />
      {howItWorksOpen && <HowItWorksModal onClose={() => setHowItWorksOpen(false)} />}
      {importLinkOpen && <ImportLinkModal onClose={() => setImportLinkOpen(false)} />}
      {modelModalOpen && (
        <ChooseModelModal
          selectedModelId={selectedModel.id}
          onSelectModel={(model) => setSelectedModel(model)}
          onClose={() => setModelModalOpen(false)}
        />
      )}
      {connectorsModalOpen && (
        <SettingsDialog
          open={connectorsModalOpen}
          onOpenChange={setConnectorsModalOpen}
          initialTab="connectors"
        />
      )}

      {/* Rename Conversation Modal */}
      {renameModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setRenameModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-popover p-5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Rename conversation</h3>
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="size-6 flex items-center justify-center rounded-full text-white/40 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (activeChatId && newTitle.trim()) {
                    void renameChat(activeChatId, newTitle.trim());
                    setRenameModalOpen(false);
                  }
                }
                if (e.key === "Escape") setRenameModalOpen(false);
              }}
              autoFocus
              className="w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 mb-4"
              placeholder="Conversation title"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeChatId && newTitle.trim()) {
                    void renameChat(activeChatId, newTitle.trim());
                    setRenameModalOpen(false);
                  }
                }}
                disabled={!newTitle.trim()}
                className="rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 transition-colors disabled:opacity-40 shadow-sm cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
