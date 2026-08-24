import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUp,
  Plus,
  ImageIcon,
  Blocks,
  Mic,
  ChevronDown,
  Check,
  Square,
  Brain,
  Globe,
  Bot,
  X,
  Plug2,
  Telescope,
  Code2,
  Megaphone,
  CalendarCheck,
} from "lucide-react";
import { AGENTS, getAgent } from "@repo/ai/lib/agents";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { KODE_DEFAULT_MODEL_ID, KODE_MODELS } from "@repo/ai/lib/kode";
import type { KodePlanTier } from "@repo/ai/lib/kode";
import { useByokProviders, canUseByokModel } from "@/lib/kode-byok";
import {
  KODE_AGENT_MODES,
  type KodeAgentMode,
} from "@/lib/kode-tools";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import type { FileUIPart } from "ai";
import { cn } from "@/lib/utils";
import { RxText } from "react-icons/rx";
import { LuImagePlus, LuSaveAll } from "react-icons/lu";
import { RiSaveLine } from "react-icons/ri";
import { IoSearch } from "react-icons/io5";
import { ImEmbed2 } from "react-icons/im";
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

function TriggerCapabilityIcons({ capabilities }: { capabilities: ModelCapability[] }) {
  if (!capabilities || capabilities.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 ml-1">
      {capabilities.map((cap) => {
        const meta = CAPABILITY_META[cap];
        if (!meta) return null;
        const Icon = meta.Icon;
        return (
          <span
            key={cap}
            title={meta.label}
            className="text-foreground/45 hover:text-white transition-colors cursor-pointer inline-flex items-center"
          >
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </div>
  );
}

// An attachment staged in the input: a file part (image or text) + extracted
// text for text files (sent to the model as context; images go as image_url).
export type StagedAttachment = FileUIPart & { id: string; text?: string };

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const MODEL_ICON_BY_PROVIDER: Partial<Record<string, string>> = {
  kontinue: "/kontinueai-icon.png",
  minimax: "/minimax.svg",
  zai: "/zai.svg",
  deepseek: "/deepseek.svg",
  xai: "/grok.svg",
  alibaba: "/qwen.svg",
  anthropic: "/claude-ai.svg",
  google: "/gemini.svg",
  openai: "/openai.svg",
};

const PLAN_RANK: Record<KodePlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

type ChatInputProps = {
  // `loading` reflects only THIS chat's in-flight send. The textarea stays
  // editable so the user can keep working (and switch to other chats).
  loading?: boolean;
  // Abort the in-flight run for this chat (turns the send button into Stop).
  onStop?: () => void;
  modelId?: string;
  onModelChange?: (modelId: string) => void;
  onSend?: (
    text: string,
    modelId: string,
    attachments?: StagedAttachment[],
    webSearchEnabled?: boolean,
  ) => void;
  placeholder?: string;
  planTier?: KodePlanTier;
  // Agent permission mode (Ask / Auto / Plan / Design).
  mode?: KodeAgentMode;
  onModeChange?: (mode: KodeAgentMode) => void;
  // Seed text into the input (e.g. when rewinding a message). The nonce lets the
  // same text be re-seeded.
  seedText?: string;
  seedNonce?: number;
  hideAgentMode?: boolean;
  onOpenModelModal?: () => void;
  modelDisplayName?: string;
  modelProvider?: string;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  onOpenConnectors?: () => void;
  onOpenAgents?: () => void;
  selectedAgentId?: string | null;
  onAgentChange?: (agentId: string | null) => void;
};

function getAgentIcon(id: string): React.ComponentType<{ size?: number; className?: string }> {
  switch (id) {
    case "research":
      return Telescope;
    case "coding":
      return Code2;
    case "marketing":
      return Megaphone;
    case "assistant":
      return CalendarCheck;
    default:
      return Bot;
  }
}

const CONNECTORS_CATALOG = [
  { provider: "github", name: "GitHub" },
  { provider: "gmail", name: "Gmail" },
  { provider: "google_calendar", name: "Google Calendar" },
  { provider: "google_drive", name: "Google Drive" },
  { provider: "google_sheets", name: "Google Sheets" },
  { provider: "notion", name: "Notion" },
  { provider: "vercel", name: "Vercel" },
  { provider: "todoist", name: "Todoist" },
];

function getConnectorLogoUrl(provider: string): string {
  switch (provider) {
    case "github":
      return "/connectors/GitHub_dark.svg";
    case "vercel":
      return "/connectors/Vercel_dark.svg";
    case "gmail":
      return "/connectors/gmail.svg";
    case "google_calendar":
      return "/connectors/google-calendar.svg";
    case "google_drive":
      return "/connectors/google-drive.svg";
    case "google_sheets":
      return "/connectors/google-sheets.svg";
    case "notion":
      return "/connectors/notion.svg";
    case "todoist":
      return "/connectors/todoist.svg";
    default:
      return "/connectors/gmail.svg";
  }
}

export function ChatInput({
  loading = false,
  onStop,
  modelId: controlledModelId,
  onModelChange,
  placeholder = "Describe what you want to build…",
  onSend,
  planTier = "free",
  mode = "ask",
  onModeChange,
  seedText = "",
  seedNonce = 0,
  hideAgentMode = false,
  onOpenModelModal,
  modelDisplayName,
  modelProvider,
  webSearchEnabled: controlledWebSearchEnabled,
  onWebSearchToggle,
  onOpenConnectors,
  onOpenAgents: _onOpenAgents,
  selectedAgentId: controlledAgentId,
  onAgentChange,
}: ChatInputProps) {
  const activeMode =
    KODE_AGENT_MODES.find((m) => m.id === mode) ?? KODE_AGENT_MODES[0];
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [internalWebSearchEnabled, setInternalWebSearchEnabled] = useState(false);
  const webSearchEnabled = controlledWebSearchEnabled ?? internalWebSearchEnabled;

  const [internalAgentId, setInternalAgentId] = useState<string | null>(null);
  const selectedAgentId = controlledAgentId ?? internalAgentId;
  const activeAgent = getAgent(selectedAgentId);

  const setSelectedAgentId = (id: string | null) => {
    setInternalAgentId(id);
    onAgentChange?.(id);
  };

  const connectorsQuery = useQuery(api.connectors.listConnectors, {});

  const toggleWebSearch = () => {
    const next = !webSearchEnabled;
    setInternalWebSearchEnabled(next);
    onWebSearchToggle?.(next);
  };

  const [uncontrolledModelId, setUncontrolledModelId] =
    useState(KODE_DEFAULT_MODEL_ID);
  const modelId = controlledModelId ?? uncontrolledModelId;
  const { getCapabilities } = useModelCapabilities();
  const byokProviders = useByokProviders();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const staged: StagedAttachment[] = [];
    for (const file of Array.from(files)) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const mediaType = file.type || "application/octet-stream";
      if (mediaType.startsWith("image/")) {
        staged.push({
          type: "file",
          id,
          mediaType,
          filename: file.name,
          url: await readAsDataURL(file),
        });
      } else {
        // Text-like file: keep its text to send to the model as context.
        const text = await readAsText(file).catch(() => "");
        staged.push({
          type: "file",
          id,
          mediaType: mediaType.startsWith("text/") ? mediaType : "text/plain",
          filename: file.name,
          url: "",
          text,
        });
      }
    }
    setAttachments((current) => [...current, ...staged]);
  };
  const selectedModel =
    KODE_MODELS.find((model) => model.id === modelId) ?? KODE_MODELS[0];

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  };

  useEffect(() => {
    if (seedNonce > 0) {
      setValue(seedText);
      requestAnimationFrame(() => {
        ref.current?.focus();
        resize();
      });
    }
    // Re-run only when a new seed is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  const submit = () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || loading) return;
    onSend?.(text, modelId, attachments.length > 0 ? attachments : undefined, webSearchEnabled);
    setValue("");
    setAttachments([]);
    requestAnimationFrame(resize);
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const setModel = (nextModelId: string) => {
    setUncontrolledModelId(nextModelId);
    onModelChange?.(nextModelId);
  };

  return (
    <div
      className="glass-strong rounded-2xl p-3 border border-white/[0.08] transition-colors duration-150 focus-within:border-white/20"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,.md,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.java,.yml,.yaml,.toml"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {attachments.length > 0 ? (
        <Attachments variant="inline" className="mb-2 px-1">
          {attachments.map((att) => (
            <Attachment
              key={att.id}
              data={att}
              onRemove={() =>
                setAttachments((cur) => cur.filter((a) => a.id !== att.id))
              }
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      ) : null}

      {(webSearchEnabled || activeAgent) && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1 pb-1">
          {activeAgent && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${activeAgent.color}15`,
                border: `1px solid ${activeAgent.color}30`,
                color: activeAgent.color,
              }}
            >
              {(() => {
                const IconComponent = getAgentIcon(activeAgent.id);
                return <IconComponent size={12} />;
              })()}
              <span>{activeAgent.name}</span>
              <button
                type="button"
                onClick={() => setSelectedAgentId(null)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-white/10 transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          )}

          {webSearchEnabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#3b82f6]">
              <Globe size={12} />
              <span>Web search active</span>
              <button
                type="button"
                onClick={toggleWebSearch}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[#3b82f6]/20 text-[#3b82f6]/70 hover:text-[#3b82f6] transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          )}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message Kode"
        className="min-h-[60px] max-h-[260px] w-full resize-none bg-transparent px-2 pt-1 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {/* Left: tools + model */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add to chat"
                className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.055] hover:text-foreground/85"
              >
                <Plus size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              sideOffset={8}
              className="w-52"
            >
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon size={14} strokeWidth={1.25} />
                <span>Add files or photos</span>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Blocks size={14} strokeWidth={1.25} />
                  <span>Connectors</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={12} className="w-60 p-1 -translate-y-[calc(100%-28px)]">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Connectors
                  </div>
                  <DropdownMenuSeparator />
                  {CONNECTORS_CATALOG.map((conn) => {
                    const isConnected = connectorsQuery?.some(
                      (c) => c.provider === conn.provider && c.connected
                    );
                    return (
                      <DropdownMenuItem
                        key={conn.provider}
                        onClick={() => {
                          if (isConnected) {
                            const mention = `@${conn.provider}`;
                            setValue((prev) => (prev ? `${prev} ${mention} ` : `${mention} `));
                          } else {
                            const url = `https://chat.kontinueai.com/api/connectors/${conn.provider}/start`;
                            void openUrl(url).catch(() => {
                              window.open(url, "_blank");
                            });
                          }
                        }}
                        className="justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={getConnectorLogoUrl(conn.provider)}
                            alt={conn.name}
                            className="size-4 object-contain shrink-0"
                          />
                          <span className="font-normal text-xs">{conn.name}</span>
                        </div>
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-400">
                            <Check size={12} />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
                            Connect
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onOpenConnectors?.()}
                    className="text-xs text-white/70 hover:text-white"
                  >
                    <Plug2 size={13} />
                    <span>Manage connectors…</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={toggleWebSearch}
                className="justify-between"
              >
                <div className="flex items-center gap-2">
                  <Globe size={14} strokeWidth={1.25} className={webSearchEnabled ? "text-[#3b82f6]" : "text-foreground/70"} />
                  <span>Web search</span>
                </div>
                {webSearchEnabled ? (
                  <Check size={14} className="text-[#3b82f6]" />
                ) : (
                  <span className="text-[10px] uppercase text-foreground/35 font-mono">Off</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Bot size={14} strokeWidth={1.25} />
                  <span>Agents</span>
                  {activeAgent && (
                    <span className="ml-auto text-[10.5px] font-medium text-white/50 truncate max-w-[80px]">
                      {activeAgent.name}
                    </span>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={12} className="w-64 p-1 -translate-y-[calc(100%-28px)]">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Agents
                  </div>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem
                    onClick={() => setSelectedAgentId(null)}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bot size={14} strokeWidth={1.25} className="text-white/60 shrink-0" />
                      <span className="font-normal text-xs">Standard Assistant</span>
                    </div>
                    {selectedAgentId === null && <Check size={12} className="text-white shrink-0" />}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />

                  {AGENTS.map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    const IconComponent = getAgentIcon(agent.id);
                    return (
                      <DropdownMenuItem
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className="justify-between items-start py-2"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 pr-2">
                          <div
                            className="size-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: `${agent.color}25`, color: agent.color }}
                          >
                            <IconComponent size={12} />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className="font-medium text-xs text-white block truncate">{agent.name}</span>
                            <p className="text-[10.5px] text-white/45 leading-tight line-clamp-1">{agent.description}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={12} className="text-white shrink-0 mt-1" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          {onOpenModelModal ? (
            <button
              type="button"
              onClick={onOpenModelModal}
              aria-label={`Selected model: ${modelDisplayName ?? selectedModel?.name ?? "K-AI 1.0"}`}
              className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/68 transition-colors hover:text-foreground"
            >
              <ModelIcon
                provider={modelProvider ?? selectedModel?.provider ?? "kontinue"}
                className="size-4"
              />
              <span>{modelDisplayName ?? selectedModel?.name ?? "K-AI 1.0"}</span>
              <TriggerCapabilityIcons capabilities={getCapabilities(modelId)} />
              <ChevronDown size={12} className="text-foreground/40" />
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Selected model: ${selectedModel?.name ?? "Kode 1.0"}`}
                  className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/68 transition-colors hover:text-foreground"
                >
                  {selectedModel && (
                    <ModelIcon
                      provider={selectedModel.provider}
                      className="size-4"
                    />
                  )}
                  <span>{selectedModel?.name ?? "Kode 1.0"}</span>
                  <ChevronDown size={12} className="text-foreground/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-72"
              >
                {KODE_MODELS.map((modelOption) => {
                  const minimumPlan = modelOption.minimumPlan as
                    | KodePlanTier
                    | undefined;
                  const planLocked =
                    minimumPlan !== undefined &&
                    PLAN_RANK[planTier] < PLAN_RANK[minimumPlan];
                  const byokUnlocked =
                    planLocked && canUseByokModel(modelOption.id, byokProviders);
                  const locked = planLocked && !byokUnlocked;

                  return (
                    <DropdownMenuItem
                      key={modelOption.id}
                      disabled={locked}
                      onClick={() => {
                        if (!locked) setModel(modelOption.id);
                      }}
                    >
                      <ModelIcon provider={modelOption.provider} />
                      <span className="min-w-0 flex-1 truncate font-normal">
                        {modelOption.name}
                      </span>
                      {byokUnlocked ? (
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] uppercase text-emerald-400">
                          BYOK
                        </span>
                      ) : locked ? (
                        <span className="rounded border border-brand/20 bg-brand/10 px-1.5 py-0.5 text-[9.5px] uppercase text-brand">
                          {minimumPlan}
                        </span>
                      ) : null}
                      <Check
                        size={13.5}
                        className={
                          modelOption.id === modelId
                            ? "opacity-100 text-foreground"
                            : "opacity-0"
                        }
                      />
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!hideAgentMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Agent mode: ${activeMode?.label}`}
                  className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/68 transition-colors hover:text-foreground"
                >
                  <span>{activeMode?.label}</span>
                  <ChevronDown size={12} className="text-foreground/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-60"
              >
                {KODE_AGENT_MODES.map((modeOption) => (
                  <DropdownMenuItem
                    key={modeOption.id}
                    disabled={modeOption.disabled}
                    onClick={() => {
                      if (!modeOption.disabled) onModeChange?.(modeOption.id);
                    }}
                    className="flex-col items-start gap-0.5"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-normal">
                        {modeOption.label}
                      </span>
                      <Check
                        size={13.5}
                        className={
                          modeOption.id === mode
                            ? "opacity-100 text-foreground"
                            : "opacity-0"
                        }
                      />
                    </div>
                    {modeOption.description && (
                      <span className="text-[11px] text-foreground/40 font-normal leading-normal">
                        {modeOption.description}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Right: dictate + send */}
        <div className="flex items-center gap-1.5">
          <ToolButton label="Dictate">
            <Mic size={15} />
          </ToolButton>
          <button
            type="button"
            onClick={loading ? onStop : submit}
            disabled={loading ? !onStop : !canSend}
            aria-label={loading ? "Stop" : "Send"}
            className="surface-raised flex size-8 items-center justify-center rounded-lg text-foreground transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              enabled:hover:bg-white/[0.07] enabled:active:scale-95"
          >
            {loading ? (
              <Square
                size={13}
                strokeWidth={2.5}
                className="fill-current text-brand"
              />
            ) : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const icon = MODEL_ICON_BY_PROVIDER[provider];

  if (icon) {
    return (
      <span className={cn("grid size-5 shrink-0 place-items-center", className)}>
        <img
          src={icon}
          alt=""
          className={cn(
            "size-4 object-contain",
            provider === "kontinue" && "brightness-0 invert",
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] font-semibold text-[9px] text-foreground/70 ring-1 ring-white/[0.08]",
        className,
      )}
      aria-hidden="true"
    >
      {provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ToolButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.055] hover:text-foreground/85"
    >
      {children}
    </button>
  );
}

export default ChatInput;
