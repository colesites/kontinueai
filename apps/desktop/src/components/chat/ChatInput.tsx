import { useEffect, useMemo, useRef, useState } from "react";
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
  Video,
  Ratio,
  Clock,
} from "lucide-react";
import { ASPECT_RATIOS, formatDuration } from "@repo/ai/lib/canvas-models";
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
  canvasControls?: CanvasControlsProps;
};

export type CanvasControlsProps = {
  mode: "image" | "video";
  onModeChange: (mode: "image" | "video") => void;
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  duration?: number;
  onDurationChange?: (duration: number) => void;
  credits?: number;
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

function renderHighlightedTokens(
  text: string,
  installedConnectors: Set<string>,
  catalogConnectors: Set<string>
) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      const provider = part.slice(1).toLowerCase();
      const isInstalled = installedConnectors.has(provider);
      const isCatalog = catalogConnectors.has(provider);
      if (isInstalled || isCatalog) {
        return (
          <span
            key={i}
            className="text-purple-600 dark:text-purple-400 font-medium"
          >
            {part}
          </span>
        );
      }
    }
    return (
      <span key={i} className="text-zinc-900 dark:text-foreground">
        {part}
      </span>
    );
  });
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
  canvasControls,
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

  const installedProviders = useMemo(() => {
    return new Set(
      connectorsQuery?.filter((c) => c.connected).map((c) => c.provider.toLowerCase()) ?? []
    );
  }, [connectorsQuery]);

  const catalogProviders = useMemo(() => {
    return new Set(CONNECTORS_CATALOG.map((c) => c.provider.toLowerCase()));
  }, []);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const list = CONNECTORS_CATALOG.filter(
      (c) =>
        c.provider.toLowerCase().startsWith(q) ||
        c.name.toLowerCase().startsWith(q)
    );
    return list.sort((a, b) => {
      const aConn = installedProviders.has(a.provider.toLowerCase());
      const bConn = installedProviders.has(b.provider.toLowerCase());
      if (aConn && !bConn) return -1;
      if (!aConn && bConn) return 1;
      return 0;
    });
  }, [mentionQuery, installedProviders]);

  const toggleWebSearch = () => {
    const next = !webSearchEnabled;
    setInternalWebSearchEnabled(next);
    onWebSearchToggle?.(next);
  };

  const [uncontrolledModelId, setUncontrolledModelId] =
    useState(KODE_DEFAULT_MODEL_ID);
  const modelId = controlledModelId ?? uncontrolledModelId;
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
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
    const nextH = Math.min(el.scrollHeight, 260) + "px";
    el.style.height = nextH;
    if (mirrorRef.current) {
      mirrorRef.current.style.height = nextH;
    }
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
    setMentionQuery(null);
    setMentionStartIndex(null);
    requestAnimationFrame(resize);
  };

  const handleSelectMention = (provider: string) => {
    if (mentionStartIndex === null) return;
    const queryLen = mentionQuery?.length ?? 0;
    const prefix = value.slice(0, mentionStartIndex);
    const suffix = value.slice(mentionStartIndex + 1 + queryLen);
    const nextVal = `${prefix}@${provider} ${suffix}`;
    setValue(nextVal);
    setMentionQuery(null);
    setMentionStartIndex(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const newPos = prefix.length + provider.length + 2;
        el.focus();
        el.setSelectionRange(newPos, newPos);
        resize();
      }
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    setValue(nextVal);
    resize();

    const caret = e.target.selectionStart;
    const before = nextVal.slice(0, caret);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
      const query = match[1];
      setMentionQuery(query);
      setMentionStartIndex(caret - query.length - 1);
      setMentionActiveIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = mentionCandidates[mentionActiveIndex] ?? mentionCandidates[0];
        if (selected) {
          handleSelectMention(selected.provider);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const setModel = (nextModelId: string) => {
    setUncontrolledModelId(nextModelId);
    onModelChange?.(nextModelId);
  };

  return (
    <div
      className="liquid-glass-composer relative rounded-[28px] p-3.5"
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

      {/* Mention Autocomplete Menu */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-4 z-50 mb-2 w-64 rounded-2xl liquid-glass-dropdown p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(168,85,247,0.2)] border border-purple-500/30">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">
            Connectors
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {mentionCandidates.map((conn, idx) => {
              const isConnected = installedProviders.has(conn.provider.toLowerCase());
              const isSelected = idx === mentionActiveIndex;
              return (
                <button
                  key={conn.provider}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMention(conn.provider);
                  }}
                  onMouseEnter={() => setMentionActiveIndex(idx)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                    isSelected
                      ? "bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-xs font-medium"
                      : "text-foreground hover:bg-purple-500/10 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={getConnectorLogoUrl(conn.provider)}
                      alt={conn.name}
                      className="size-4 object-contain shrink-0"
                    />
                    <span className="truncate">{conn.name}</span>
                  </div>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-purple-400 shrink-0">
                      <Check size={11} className="text-purple-400" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-muted-foreground/60 shrink-0">
                      Connect
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Textarea with Highlight Mirror Overlay */}
      <div className="relative min-h-[64px] max-h-[260px] w-full">
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words px-2.5 pt-1.5 text-[15px] leading-relaxed font-sans"
        >
          {renderHighlightedTokens(value, installedProviders, catalogProviders)}
          {value.endsWith("\n") ? "\n " : ""}
        </div>

        <textarea
          ref={ref}
          value={value}
          rows={1}
          onChange={handleInputChange}
          onScroll={(e) => {
            if (mirrorRef.current) {
              mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
          onClick={(e) => {
            const caret = e.currentTarget.selectionStart;
            const before = value.slice(0, caret);
            const match = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
            if (match) {
              setMentionQuery(match[1]);
              setMentionStartIndex(caret - match[1].length - 1);
            } else {
              setMentionQuery(null);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Message Kode"
          className={cn(
            "relative z-10 min-h-[64px] max-h-[260px] w-full resize-none bg-transparent px-2.5 pt-1.5 text-[15px] leading-relaxed font-sans focus:outline-none disabled:cursor-not-allowed disabled:opacity-55",
            value.length > 0
              ? "text-transparent caret-zinc-900 dark:caret-white"
              : "text-zinc-900 dark:text-foreground placeholder:text-zinc-400 dark:placeholder:text-foreground/35"
          )}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {/* Left: tools + model */}
        {canvasControls ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach reference image"
              aria-label="Attach reference image"
              className="flex size-7.5 items-center justify-center rounded-full liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground cursor-pointer"
            >
              <Plus size={14} />
            </button>

            {/* Mode Toggle: [ Image | Video ] */}
            <div className="inline-flex h-7.5 shrink-0 items-center gap-0.5 rounded-full p-0.5 liquid-glass-pill select-none border border-white/5">
              <button
                type="button"
                onClick={() => canvasControls.onModeChange("image")}
                className={cn(
                  "inline-flex h-6.5 items-center gap-1.5 rounded-full px-3 text-xs transition-all cursor-pointer",
                  canvasControls.mode === "image"
                    ? "bg-purple-500/15 border border-purple-500/50 text-white font-semibold shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                    : "border border-transparent text-zinc-600 dark:text-muted-foreground hover:text-foreground"
                )}
              >
                <ImageIcon
                  size={12}
                  className={canvasControls.mode === "image" ? "text-purple-400" : "text-muted-foreground"}
                />
                <span>Image</span>
              </button>
              <button
                type="button"
                onClick={() => canvasControls.onModeChange("video")}
                className={cn(
                  "inline-flex h-6.5 items-center gap-1.5 rounded-full px-3 text-xs transition-all cursor-pointer",
                  canvasControls.mode === "video"
                    ? "bg-purple-500/15 border border-purple-500/50 text-white font-semibold shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                    : "border border-transparent text-zinc-600 dark:text-muted-foreground hover:text-foreground"
                )}
              >
                <Video
                  size={12}
                  className={canvasControls.mode === "video" ? "text-purple-400" : "text-muted-foreground"}
                />
                <span>Video</span>
              </button>
            </div>

            {/* Aspect Ratio Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7.5 items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80 cursor-pointer select-none border border-purple-500/35 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.15)] hover:border-purple-500/50 hover:bg-purple-500/15"
                >
                  <Ratio size={12} className="text-purple-400" />
                  <span className="font-semibold text-purple-200">{canvasControls.aspectRatio}</span>
                  <ChevronDown size={11} className="text-purple-300 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-36 p-1 rounded-2xl liquid-glass-dropdown">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">
                  Aspect Ratio
                </div>
                {ASPECT_RATIOS.map((r) => {
                  const isSelected = canvasControls.aspectRatio === r.value;
                  return (
                    <DropdownMenuItem
                      key={r.value}
                      onClick={() => canvasControls.onAspectRatioChange(r.value)}
                      className={cn(
                        "justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors",
                        isSelected
                          ? "bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <span>{r.label}</span>
                      {isSelected && <Check size={12} className="text-purple-400 shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Model Picker Popover */}
            <ModelPickerPopover
              models={models}
              selectedModelId={modelId}
              onSelectModel={(selected) => {
                setModel(selected.id);
              }}
              onOpenSettings={onOpenConnectors}
            />

            {/* Video Duration (if mode === video) */}
            {canvasControls.mode === "video" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7.5 items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80 cursor-pointer select-none border border-purple-500/35 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.15)] hover:border-purple-500/50 hover:bg-purple-500/15"
                  >
                    <Clock size={12} className="text-purple-400" />
                    <span className="font-semibold text-purple-200">{formatDuration(canvasControls.duration ?? 5)}</span>
                    <ChevronDown size={11} className="text-purple-300 ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-32 p-1 rounded-2xl liquid-glass-dropdown">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">
                    Duration
                  </div>
                  {[5, 10, 15, 30].map((d) => {
                    const isSelected = canvasControls.duration === d;
                    return (
                      <DropdownMenuItem
                        key={d}
                        onClick={() => canvasControls.onDurationChange?.(d)}
                        className={cn(
                          "justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors",
                          isSelected
                            ? "bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <span>{formatDuration(d)}</span>
                        {isSelected && <Check size={12} className="text-purple-400 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add to chat"
                className="flex size-7.5 items-center justify-center rounded-full liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground cursor-pointer"
              >
                <Plus size={14} />
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
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                            requestAnimationFrame(() => {
                              ref.current?.focus();
                              resize();
                            });
                          } else {
                            const url = `https://chat.kontinueai.com/api/connectors/${conn.provider}/start`;
                            void openUrl(url).catch(() => {
                              window.open(url, "_blank");
                            });
                          }
                        }}
                        className={cn(
                          "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                          isConnected
                            ? "bg-purple-500/10 border border-purple-500/25 text-purple-200"
                            : "hover:bg-accent"
                        )}
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
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-purple-400">
                            <Check size={12} className="text-purple-400" />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px] font-normal text-foreground dark:text-white hover:text-foreground/80 dark:hover:text-white/80 transition-colors">
                            Connect
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onOpenConnectors?.()}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Plug2 size={13} />
                    <span>Manage connectors…</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={toggleWebSearch}
                className={cn(
                  "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                  webSearchEnabled
                    ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium"
                    : "hover:bg-accent"
                )}
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
                className={cn(
                  "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                  reasoningEnabled
                    ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium"
                    : "hover:bg-accent"
                )}
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
                    <span className="ml-auto text-[10.5px] font-medium text-purple-400 truncate max-w-[80px]">
                      {activeAgent.name}
                    </span>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={12} className="w-64 p-1 -translate-y-[calc(100%-28px)]">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300/80">
                    Agents
                  </div>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem
                    onClick={() => setSelectedAgentId(null)}
                    className={cn(
                      "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                      selectedAgentId === null
                        ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 font-medium"
                        : "hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bot size={14} strokeWidth={1.25} className={selectedAgentId === null ? "text-purple-400 shrink-0" : "text-muted-foreground shrink-0"} />
                      <span className="font-normal text-xs">Standard Assistant</span>
                    </div>
                    {selectedAgentId === null && <Check size={12} className="text-purple-400 shrink-0" />}
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />

                  {AGENTS.map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    const IconComponent = getAgentIcon(agent.id);
                    return (
                      <DropdownMenuItem
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={cn(
                          "justify-between items-start py-2 cursor-pointer rounded-lg px-2 transition-colors",
                          isSelected
                            ? "bg-purple-500/15 border border-purple-500/30 text-purple-200 shadow-xs"
                            : "hover:bg-accent"
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 pr-2">
                          <div
                            className="size-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                            style={{ backgroundColor: `${agent.color}25`, color: agent.color }}
                          >
                            <IconComponent size={12} />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className={cn("font-medium text-xs block truncate", isSelected ? "text-purple-100" : "text-foreground")}>{agent.name}</span>
                            <p className={cn("text-[10.5px] leading-tight line-clamp-1", isSelected ? "text-purple-300/80" : "text-muted-foreground")}>{agent.description}</p>
                          </div>
                        </div>
                        {isSelected && <Check size={12} className="text-purple-400 shrink-0 mt-1" />}
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
                  className="flex h-7 items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80 cursor-pointer select-none"
                >
                  {(() => {
                    const ModeIcon = (mode && MODE_ICON_MAP[mode]) || Lock;
                    return <ModeIcon className="size-3.5 text-purple-700 dark:text-foreground/80" />;
                  })()}
                  <span className="font-semibold text-zinc-900 dark:text-foreground">{activeMode?.label ?? "Supervised"}</span>
                  <ChevronDown size={11} className="text-muted-foreground ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                sideOffset={8}
                className="w-[285px] p-1.5 rounded-2xl liquid-glass-dropdown text-foreground select-none space-y-0.5"
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
                          ? "bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-200 shadow-xs"
                          : "border border-transparent text-foreground/80 hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className={cn("size-4 shrink-0", isSelected ? "text-purple-600 dark:text-purple-400" : "text-foreground/80")} />
                        <span className={cn("text-[13px] font-semibold", isSelected ? "text-purple-900 dark:text-purple-100" : "text-foreground")}>
                          {modeOption.label}
                        </span>
                      </div>
                      <p className={cn("text-[11.5px] leading-relaxed mt-0.5 pl-6", isSelected ? "text-purple-700/80 dark:text-purple-200/70" : "text-muted-foreground")}>
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
                "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition-all cursor-pointer select-none",
                reasoningEnabled
                  ? "bg-purple-500/15 border border-purple-500/50 text-purple-200 font-semibold shadow-[0_0_12px_rgba(168,85,247,0.35)] hover:border-purple-500/70 hover:bg-purple-500/20"
                  : "liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground"
              )}
            >
              <Brain
                size={13}
                className={cn(
                  "transition-colors",
                  reasoningEnabled ? "text-purple-400" : "text-muted-foreground"
                )}
              />
              <span>Thinking</span>
              <span
                className={cn(
                  "text-[9.5px] font-mono uppercase tracking-wider font-bold",
                  reasoningEnabled ? "text-purple-300" : "text-muted-foreground"
                )}
              >
                {reasoningEnabled ? "On" : "Off"}
              </span>
            </button>
          )}
        </div>
        )}

        {/* Right: dictate + send */}
        <div className="flex items-center gap-1.5">
          {canvasControls?.credits !== undefined && (
            <span className="text-xs text-muted-foreground font-medium px-1.5">
              {canvasControls.credits} credits
            </span>
          )}
          <ToolButton label="Dictate">
            <Mic size={15} />
          </ToolButton>
          <button
            type="button"
            onClick={loading ? onStop : submit}
            disabled={loading ? !onStop : !canSend}
            aria-label={loading ? "Stop" : "Send"}
            className="flex size-7.5 items-center justify-center rounded-lg transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              bg-purple-600 dark:bg-purple-600 text-white shadow-[0_4px_14px_rgba(147,51,234,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]
              enabled:hover:bg-purple-500 enabled:hover:shadow-[0_6px_20px_rgba(147,51,234,0.45)] enabled:hover:scale-105 enabled:active:scale-95 cursor-pointer"
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
      className="flex size-7.5 items-center justify-center rounded-full liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground cursor-pointer"
    >
      {children}
    </button>
  );
}

export default ChatInput;
