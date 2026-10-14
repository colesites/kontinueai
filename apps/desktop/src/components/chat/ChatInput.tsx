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
  Lock,
  FileEdit,
  Sparkles,
  Zap,
  Palette,
} from "lucide-react";
import { AGENTS, getAgent } from "@repo/ai/lib/agents";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { KODE_DEFAULT_MODEL_ID, type KodePlanTier } from "@repo/ai/lib/kode";
import {
  KODE_AGENT_MODES,
  type KodeAgentMode,
} from "@/lib/kode-tools";
import { ModelPickerPopover, type AnyModelOption } from "./ModelPickerPopover";
import { KodeReasoningPopover } from "./KodeReasoningPopover";
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
import {
  readCachedReasoningEnabled,
  writeCachedReasoningEnabled,
} from "@repo/core/reasoning-preference";

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


const MODE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  supervised: Lock,
  auto_edits: FileEdit,
  auto: Sparkles,
  full_access: Zap,
  design: Palette,
  ask: Lock,
  plan: Lock,
};

type ChatInputProps = {
  // `loading` reflects only THIS chat's in-flight send. The textarea stays
  // editable so the user can keep working (and switch to other chats).
  loading?: boolean;
  // Abort the in-flight run for this chat (turns the send button into Stop).
  onStop?: () => void;
  modelId?: string;
  models?: AnyModelOption[];
  onModelChange?: (modelId: string) => void;
  onSend?: (
    text: string,
    modelId: string,
    attachments?: StagedAttachment[],
    webSearchEnabled?: boolean,
    reasoningEnabled?: boolean,
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
  reasoningEnabled?: boolean;
  onReasoningToggle?: (enabled: boolean) => void;
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
  models,
  modelId: controlledModelId,
  onModelChange,
  placeholder = "Describe what you want to build…",
  onSend,
  planTier: _planTier = "free",
  mode = "ask",
  onModeChange,
  seedText = "",
  seedNonce = 0,
  hideAgentMode = false,
  onOpenModelModal: _onOpenModelModal,
  modelDisplayName: _modelDisplayName,
  modelProvider: _modelProvider,
  webSearchEnabled: controlledWebSearchEnabled,
  onWebSearchToggle,
  reasoningEnabled: controlledReasoningEnabled,
  onReasoningToggle,
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

  const [internalReasoningEnabled, setInternalReasoningEnabled] = useState<boolean>(
    () => readCachedReasoningEnabled() ?? true,
  );
  const reasoningEnabled = controlledReasoningEnabled ?? internalReasoningEnabled;

  const toggleReasoning = () => {
    const next = !reasoningEnabled;
    setInternalReasoningEnabled(next);
    writeCachedReasoningEnabled(next);
    onReasoningToggle?.(next);
  };

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
    onSend?.(
      text,
      modelId,
      attachments.length > 0 ? attachments : undefined,
      webSearchEnabled,
      reasoningEnabled,
    );
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
      className="bg-card/95 border border-border shadow-md dark:shadow-none rounded-2xl p-3 transition-all duration-200 focus-within:border-purple-500/40 focus-within:shadow-[0_0_20px_rgba(168,85,247,0.12)]"
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
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors cursor-pointer"
              >
                <X size={11} />
              </button>
            </span>
          )}

          {webSearchEnabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/30 px-2.5 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
              <Globe size={12} className="text-purple-600 dark:text-purple-300" />
              <span>Web search active</span>
              <button
                type="button"
                onClick={toggleWebSearch}
                className="ml-0.5 rounded-full p-0.5 hover:bg-purple-200 dark:hover:bg-purple-500/25 text-purple-600 dark:text-purple-300 transition-colors cursor-pointer"
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
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/50 text-foreground/70 transition-all hover:bg-secondary hover:border-border hover:text-foreground cursor-pointer"
              >
                <Plus size={15} />
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
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-purple-400">
                            <Check size={12} />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px] font-normal text-white hover:text-white/80 transition-colors">
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
                  <Globe size={14} strokeWidth={1.25} className={webSearchEnabled ? "text-purple-400" : "text-foreground/70"} />
                  <span>Web search</span>
                </div>
                {webSearchEnabled ? (
                  <Check size={14} className="text-purple-400" />
                ) : (
                  <span className="text-[10px] uppercase text-foreground/35 font-mono">Off</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={toggleReasoning}
                className="justify-between"
              >
                <div className="flex items-center gap-2">
                  <Brain
                    size={14}
                    strokeWidth={1.25}
                    className={reasoningEnabled ? "text-purple-400" : "text-foreground/70"}
                  />
                  <span>Thinking</span>
                </div>
                {reasoningEnabled ? (
                  <Check size={14} className="text-purple-400" />
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

          {/* Model Picker Popover (supports both Home AVAILABLE_MODELS and Kode KODE_MODELS) */}
          <ModelPickerPopover
            models={models}
            selectedModelId={modelId}
            onSelectModel={(selected) => {
              setModel(selected.id);
            }}
            onOpenSettings={onOpenConnectors}
          />

          {/* Execution Mode Dropdown for Kode (matching Image 2) */}
          {!hideAgentMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Execution mode: ${activeMode?.label ?? "Supervised"}`}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white/80 transition-all hover:bg-white/[0.08] hover:text-white cursor-pointer select-none"
                >
                  {(() => {
                    const ModeIcon = (mode && MODE_ICON_MAP[mode]) || Lock;
                    return <ModeIcon className="size-3.5 text-white/80" />;
                  })()}
                  <span className="font-medium text-white">{activeMode?.label ?? "Supervised"}</span>
                  <ChevronDown size={11} className="text-white/40 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
                className="w-[285px] p-1.5 rounded-xl border border-white/[0.08] bg-[#121215]/80 backdrop-blur-2xl shadow-2xl shadow-black/80 text-white select-none space-y-0.5"
              >
                {KODE_AGENT_MODES.map((modeOption) => {
                  const IconComponent = MODE_ICON_MAP[modeOption.id] || Lock;
                  const isSelected = modeOption.id === mode;
                  return (
                    <button
                      key={modeOption.id}
                      type="button"
                      onClick={() => {
                        onModeChange?.(modeOption.id);
                      }}
                      className={cn(
                        "flex w-full flex-col items-start rounded-lg p-2.5 text-left transition-all cursor-pointer",
                        isSelected
                          ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 shadow-xs"
                          : "border border-transparent text-white/80 hover:bg-white/[0.04] hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className={cn("size-4 shrink-0", isSelected ? "text-purple-400" : "text-white/80")} />
                        <span className={cn("text-[13px] font-semibold", isSelected ? "text-purple-100" : "text-white")}>
                          {modeOption.label}
                        </span>
                      </div>
                      <p className={cn("text-[11.5px] leading-relaxed mt-0.5 pl-6", isSelected ? "text-purple-200/70" : "text-white/50")}>
                        {modeOption.description}
                      </p>
                    </button>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Reasoning / Thinking: Popover in Kode (matching Image 1), Toggle in Home */}
          {!hideAgentMode ? (
            <KodeReasoningPopover
              modelId={modelId}
              reasoningEnabled={reasoningEnabled}
              onReasoningToggle={onReasoningToggle}
            />
          ) : (
            <button
              type="button"
              onClick={toggleReasoning}
              aria-label={`Thinking ${reasoningEnabled ? "enabled" : "disabled"}`}
              title={
                reasoningEnabled
                  ? "Thinking is ON (Click to disable)"
                  : "Thinking is OFF (Click to enable)"
              }
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all cursor-pointer select-none",
                reasoningEnabled
                  ? "border-purple-500/35 bg-purple-500/10 text-white font-medium hover:border-purple-500/50 hover:bg-purple-500/15"
                  : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:border-white/[0.15] hover:bg-white/[0.08] hover:text-white"
              )}
            >
              <Brain
                size={13}
                className={cn(
                  "transition-colors",
                  reasoningEnabled ? "text-purple-400" : "text-white/40"
                )}
              />
              <span>Thinking</span>
              <span
                className={cn(
                  "text-[9.5px] font-mono uppercase tracking-wider font-semibold",
                  reasoningEnabled ? "text-purple-300" : "text-white/40"
                )}
              >
                {reasoningEnabled ? "On" : "Off"}
              </span>
            </button>
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
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary text-foreground transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              enabled:hover:bg-purple-600 enabled:hover:border-purple-600 enabled:hover:text-white enabled:active:scale-95 cursor-pointer"
          >
            {loading ? (
              <Square
                size={13}
                strokeWidth={2.5}
                className="fill-current text-purple-600 dark:text-purple-400"
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
      className="flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/50 text-foreground/70 transition-all hover:bg-secondary hover:border-border hover:text-foreground cursor-pointer"
    >
      {children}
    </button>
  );
}

export default ChatInput;
