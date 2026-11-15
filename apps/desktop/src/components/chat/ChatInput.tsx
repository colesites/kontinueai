import { accountGroups } from "@/lib/kode-accounts";
import { kindName } from "@/lib/kode-cli";
import { AGENTS, getAgent } from "@repo/ai/lib/agents";
import { ASPECT_RATIOS, formatDuration } from "@repo/ai/lib/canvas-models";
import { KODE_DEFAULT_MODEL_ID, type KodePlan } from "@repo/ai/lib/kode";
import {
  readCachedReasoningEnabled,
  writeCachedReasoningEnabled,
} from "@repo/core/reasoning-preference";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import type { FileUIPart } from "ai";
import { useQuery } from "convex/react";
import {
  Archive,
  ArrowUp,
  MessageSquarePlus,
  Blocks,
  Bot,
  Brain,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Code2,
  FileText,
  Folder,
  Box,
  ChevronRight,
  Globe,
  ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  Plug2,
  Plus,
  Ratio,
  Search,
  Square,
  Telescope,
  Video,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/lib/app-settings";
import { api } from "@/lib/convex-api";
import {
  MAX_DICTATION_MS,
  type Recorder,
  startRecording,
  transcribe,
} from "@/lib/dictation";
import { KODE_AGENT_MODES, type KodeAgentMode } from "@/lib/kode-tools";
import { slashEntries, type SlashEntry, type SlashSkill } from "@/lib/kode-commands";
import { mentionEntries, type MentionEntry } from "@/lib/kode-mentions";
import { loadUserCommands, pluginCommands, usePlugins, type UserCommand } from "@/lib/kode-plugins";
import { removeStashed, stashDraft, useStash } from "@/lib/kode-stash";
import { annotationTitle, removeAnnotation, useAnnotations } from "@/lib/kode-annotations";
import { cn } from "@/lib/utils";
import { KodeReasoningPopover } from "./KodeReasoningPopover";
import type { KodeEffort } from "@repo/ai/lib/kode";
import { type AnyModelOption, ModelPickerPopover } from "./ModelPickerPopover";
import { KodeModeMenu } from "./KodeModeMenu";
import { useKeybinding } from "@/lib/kode-keybindings";
import { SlashPicker } from "./SlashPicker";
import { HoverInfo, HoverInfoProvider } from "@/components/ui/hover-info";

// An attachment staged in the input: a file part (image or text) + extracted
// text for text files (sent to the model as context; images go as image_url).
export type StagedAttachment = FileUIPart & { id: string; text?: string };

/** Drag data type for a Kode chat dragged from the sidebar. */
export const KODE_CHAT_DRAG_TYPE = "application/x-kode-chat";
export type DroppedChat = { id: string; title: string };
/** A chat offered in + → "Add a chat as context". */
export type ContextChat = DroppedChat & { project?: string | null; updatedAt?: number };

/** `/` with a gentle slope (lucide's Slash leans too far). */
function SlashCommandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden>
      <path d="M14.5 4 9.5 20" />
    </svg>
  );
}

/** "better-auth-best-practices" → "Better Auth Best Practices"; connectors use their name. */
function tokenLabel(token: SlashEntry): string {
  if (token.kind === "connector") {
    return CONNECTORS_CATALOG.find((c) => c.provider === token.name)?.name ?? token.name;
  }
  if (token.kind === "command") return token.name;
  return token.name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function shortAgo(timestamp?: number): string {
  if (!timestamp) return "";
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
}

/** + menu → searchable list of chats to attach as context. */
function ChatContextMenu({
  chats,
  onPick,
}: {
  chats: ContextChat[];
  onPick: (chat: ContextChat) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (q
    ? chats.filter(
        (chat) =>
          chat.title.toLowerCase().includes(q) ||
          (chat.project ?? "").toLowerCase().includes(q),
      )
    : chats
  ).slice(0, 50);
  return (
    <DropdownMenuSub onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuSubTrigger>
        <MessageSquarePlus size={14} strokeWidth={1.25} />
        <span>Add a chat as context</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={8} className="flex w-72 flex-col p-1.5">
        <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Keep the menu's type-to-select from eating keystrokes.
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search chats"
            className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {matches.map((chat) => (
            <DropdownMenuItem
              key={chat.id}
              onClick={() => onPick(chat)}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{chat.title}</span>
                {chat.project ? (
                  <span className="block truncate text-caption text-muted-foreground">{chat.project}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-caption text-muted-foreground">{shortAgo(chat.updatedAt)}</span>
            </DropdownMenuItem>
          ))}
          {matches.length === 0 ? (
            <p className="px-2 py-2 text-label text-muted-foreground">No chats match.</p>
          ) : null}
        </div>
        <p className="px-2 pt-1.5 text-caption text-muted-foreground/80">
          Tip: you can also drag a chat from the sidebar onto the message box.
        </p>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Text we can show the model as-is: no NUL bytes in the first 8 KB. */
async function looksLikeText(file: File): Promise<boolean> {
  if (file.type.startsWith("text/") || /json|xml|javascript|typescript|yaml|toml|sql|x-sh/.test(file.type)) return true;
  if (/^(application\/pdf|image\/|audio\/|video\/|font\/)/.test(file.type) || /zip|octet-stream|msword|officedocument/.test(file.type) && file.type !== "application/octet-stream") return false;
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  return !head.includes(0);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

type ChatInputProps = {
  // `loading` reflects only THIS chat's in-flight send. The textarea stays
  // editable so the user can keep working (and switch to other chats).
  loading?: boolean;
  // Abort the in-flight run for this chat (turns the send button into Stop).
  onStop?: () => void;
  /** While `loading`, still accept messages (the caller queues them). */
  queueWhileLoading?: boolean;
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
  planTier?: KodePlan;
  // Agent permission mode (Ask / Auto / Plan / Design).
  mode?: KodeAgentMode;
  onModeChange?: (mode: KodeAgentMode) => void;
  // Seed text into the input (e.g. when rewinding a message). The nonce lets the
  // same text be re-seeded.
  seedText?: string;
  seedNonce?: number;
  hideAgentMode?: boolean;
  /** Footer inside the composer (Kode: project / work in / branch). Hidden by the caller when there is no project. */
  bottomBar?: React.ReactNode;
  /** Header attached on the composer (Kode: allow / question). Same banner as the footer, on top. */
  topBar?: React.ReactNode;
  /** A chat dragged in from the sidebar: return its context as an attachment. */
  onDropChat?: (chat: DroppedChat) => Promise<StagedAttachment | null>;
  /** Recent chats offered under + → "Add a chat as context". */
  contextChats?: ContextChat[];
  /** In a session: a shorter version of this composer. Toolbar keeps add, mic, and send. Model, permissions, reasoning, and context move to the banner. */
  compact?: boolean;
  /** Extra control in the composer toolbar, before dictate and send (Kode: context meter). */
  trailing?: React.ReactNode;
  /** Installed skills, surfaced in the `/` slash picker. */
  skills?: SlashSkill[];
  /** Active project root, for the `@` file mention picker. */
  projectRoot?: string | null;
  onOpenModelModal?: () => void;
  modelDisplayName?: string;
  modelProvider?: string;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  reasoningEnabled?: boolean;
  onReasoningToggle?: (enabled: boolean) => void;
  /** Kode: this chat's reasoning and context window (see KodeReasoningPopover). */
  chatReasoning?: KodeEffort | "off";
  chatContextWindow?: number | null;
  /** Kode: the selected model's window when it isn't adjustable. */
  resolvedContextWindow?: number | null;
  onChatReasoningChange?: (next: KodeEffort | "off") => void;
  onChatContextWindowChange?: (next: number) => void;
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

function getAgentIcon(
  id: string,
): React.ComponentType<{ size?: number; className?: string }> {
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
  catalogConnectors: Set<string>,
) {
  if (!text) return null;
  // Connectors are referenced as `/github` (start of text or after a space).
  const parts = text.split(/((?:^|(?<=\s))\/[a-zA-Z0-9_-]+)/g);
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const part of parts) {
    const key = `${offset}:${part}`;
    offset += part.length || 1;
    if (part.startsWith("/")) {
      const provider = part.slice(1).toLowerCase();
      const isInstalled = installedConnectors.has(provider);
      const isCatalog = catalogConnectors.has(provider);
      if (isInstalled || isCatalog) {
        nodes.push(
          <span
            key={key}
            className="text-purple-600 dark:text-purple-400 font-medium"
          >
            {part}
          </span>,
        );
        continue;
      }
    }
    nodes.push(
      <span key={key} className="text-zinc-900 dark:text-foreground">
        {part}
      </span>,
    );
  }
  return nodes;
}

export function ChatInput({
  loading = false,
  onStop,
  queueWhileLoading = false,
  models,
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
  bottomBar,
  topBar,
  compact = false,
  trailing,
  skills = [],
  projectRoot = null,
  onDropChat,
  contextChats = [],
  onOpenModelModal: _onOpenModelModal,
  modelDisplayName: _modelDisplayName,
  modelProvider: _modelProvider,
  webSearchEnabled: controlledWebSearchEnabled,
  onWebSearchToggle,
  reasoningEnabled: controlledReasoningEnabled,
  onReasoningToggle,
  chatReasoning,
  chatContextWindow,
  resolvedContextWindow,
  onChatReasoningChange,
  onChatContextWindowChange,
  onOpenConnectors,
  onOpenAgents: _onOpenAgents,
  selectedAgentId: controlledAgentId,
  onAgentChange,
  canvasControls,
}: ChatInputProps) {
  const { sendOnEnter } = useAppSettings();
  // ⌘⇧M (Settings → Keyboard shortcuts) opens the model picker.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  useKeybinding("composer.modelPicker", () => setModelPickerOpen(true));
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [internalWebSearchEnabled, setInternalWebSearchEnabled] =
    useState(false);
  const webSearchEnabled =
    controlledWebSearchEnabled ?? internalWebSearchEnabled;

  const [internalReasoningEnabled, setInternalReasoningEnabled] =
    useState<boolean>(() => readCachedReasoningEnabled() ?? true);
  const reasoningEnabled =
    controlledReasoningEnabled ?? internalReasoningEnabled;

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
      connectorsQuery
        ?.filter((c) => c.connected)
        .map((c) => c.provider.toLowerCase()) ?? [],
    );
  }, [connectorsQuery]);

  const catalogProviders = useMemo(() => {
    return new Set(CONNECTORS_CATALOG.map((c) => c.provider.toLowerCase()));
  }, []);

  // Project files for the `@` mention picker (loaded once per project).
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!projectRoot) {
      setProjectFiles([]);
      return;
    }
    let cancelled = false;
    invoke<string[]>("kode_list_project_files", { root: projectRoot })
      .then((files) => {
        if (!cancelled) setProjectFiles(files);
      })
      .catch(() => {
        if (!cancelled) setProjectFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  // Where the `/` being completed starts (0 = start of the message, where
  // commands and skills apply; later only connectors make sense).
  const [slashStart, setSlashStart] = useState(0);
  const plugins = usePlugins();
  // Your own commands (~/.claude/commands, <project>/.claude/commands).
  const [ownCommands, setOwnCommands] = useState<UserCommand[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void loadUserCommands(projectRoot).then((list) => {
        if (!cancelled) setOwnCommands(list);
      });
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [projectRoot]);
  const appSettingsForSlash = useAppSettings();
  const slashAll = useMemo(
    () =>
      slashEntries(
        skills,
        CONNECTORS_CATALOG.filter((c) =>
          installedProviders.has(c.provider.toLowerCase()),
        ).map((c) => ({ provider: c.provider, name: c.name, connected: true })),
        [
          ...ownCommands.map((c) => ({ ...c, plugin: c.scope === "project" ? "project" : "you" })),
          ...pluginCommands(plugins),
        ],
        // Several accounts of a provider: /switch and /switch-<account>.
        accountGroups(appSettingsForSlash).flatMap((group) =>
          group.accounts.filter((a) => a.enabled).map((a) => ({ id: a.id, label: a.label, provider: kindName(a) })),
        ),
      ),
    [skills, installedProviders, plugins, ownCommands, appSettingsForSlash],
  );
  const slashCandidates = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return slashAll.filter(
      (entry) =>
        (slashStart === 0 || entry.kind === "connector") &&
        (entry.name.toLowerCase().startsWith(q) ||
          entry.description.toLowerCase().includes(q)),
    );
  }, [slashAll, slashQuery, slashStart]);

  // Root folders and files first; `@src/` goes into src; typing searches all.
  const mentionCandidates = useMemo(
    () => (mentionQuery === null ? [] : mentionEntries(projectFiles, mentionQuery)),
    [mentionQuery, projectFiles],
  );
  const mentionFolder =
    mentionQuery && mentionQuery.includes("/")
      ? mentionQuery.slice(0, mentionQuery.lastIndexOf("/"))
      : null;

  const toggleWebSearch = () => {
    const next = !webSearchEnabled;
    setInternalWebSearchEnabled(next);
    onWebSearchToggle?.(next);
  };

  const [uncontrolledModelId, setUncontrolledModelId] = useState(
    KODE_DEFAULT_MODEL_ID,
  );
  const modelId = controlledModelId ?? uncontrolledModelId;
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bannerSlot, setBannerSlot] = useState<HTMLDivElement | null>(null);
  const [fieldGrown, setFieldGrown] = useState(false);

  const [dropActive, setDropActive] = useState(false);
  // Notes from Annotate (selected text, browser elements); sent with the message.
  const annotations = useAnnotations();
  /** Attach another chat's context (dragged in, or picked from the + menu). */
  const attachChat = async (chat: DroppedChat) => {
    if (!onDropChat) return;
    try {
      const attachment = await onDropChat(chat);
      if (attachment) setAttachments((current) => [...current, attachment]);
    } catch {
      // Couldn't load that chat: nothing to attach.
    }
    requestAnimationFrame(() => ref.current?.focus());
  };
  const canDrop = (types: readonly string[]) =>
    types.includes("Files") || (!!onDropChat && types.includes(KODE_CHAT_DRAG_TYPE));
  const handleDrop = async (e: React.DragEvent) => {
    setDropActive(false);
    const chatData = e.dataTransfer.getData(KODE_CHAT_DRAG_TYPE);
    if (chatData && onDropChat) {
      e.preventDefault();
      try {
        await attachChat(JSON.parse(chatData) as DroppedChat);
      } catch {
        // Not a chat we can read: nothing to attach.
      }
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      await addFiles(e.dataTransfer.files);
    }
  };

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const staged: StagedAttachment[] = [];
    for (const file of Array.from(files)) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const mediaType = file.type || "application/octet-stream";
      // Pasted screenshots arrive as "image.png"; give them a unique name.
      const filename = mediaType.startsWith("image/") && /^image\.\w+$/.test(file.name)
        ? `screenshot-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${file.name.split(".").pop()}`
        : file.name || "attachment";
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      if (mediaType.startsWith("image/")) {
        staged.push({
          type: "file",
          id,
          mediaType,
          filename,
          url: await readAsDataURL(file),
        });
      } else if (await looksLikeText(file)) {
        // Text-like file: keep its text to send to the model as context.
        const text = await readAsText(file).catch(() => "");
        staged.push({
          type: "file",
          id,
          mediaType: mediaType.startsWith("text/") ? mediaType : "text/plain",
          filename,
          url: "",
          text,
        });
      } else {
        // PDF or other binary: saved into the project for agents to open by
        // path (Claude Code and Codex read PDFs), never inlined as text.
        staged.push({
          type: "file",
          id,
          mediaType,
          filename,
          url: await readAsDataURL(file),
        });
      }
    }
    setAttachments((current) => [...current, ...staged]);
  };

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const full = el.scrollHeight;
    const nextH = `${Math.min(full, compact ? 140 : 260)}px`;
    el.style.height = nextH;
    if (mirrorRef.current) {
      mirrorRef.current.style.height = nextH;
    }
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 32;
    setFieldGrown(compact && full > line + 4);
  }, [compact]);

  useEffect(() => {
    if (seedNonce > 0) {
      setValue(seedText);
      requestAnimationFrame(() => {
        ref.current?.focus();
        resize();
      });
    }
  }, [seedNonce, seedText, resize]);

  const submit = () => {
    const typed = value.trim();
    const hasNotes = !canvasControls && annotations.length > 0;
    if ((!typed && attachments.length === 0 && !hasNotes && tokens.length === 0) || (loading && !queueWhileLoading)) return;
    const text = [tokenPrefix(), typed].filter(Boolean).join(" ");
    setTokens([]);
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

  /** Picking a folder opens it in the picker (`@src/`); a file is attached. */
  const handlePickMention = (entry: MentionEntry) => {
    if (!entry.isDir) {
      void handleSelectMention(entry.path);
      return;
    }
    if (mentionStartIndex === null) return;
    const queryLen = mentionQuery?.length ?? 0;
    const prefix = value.slice(0, mentionStartIndex);
    const suffix = value.slice(mentionStartIndex + 1 + queryLen);
    const query = `${entry.path}/`;
    setValue(`${prefix}@${query}${suffix}`);
    setMentionQuery(query);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const pos = prefix.length + 1 + query.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleSelectMention = async (path: string) => {
    if (mentionStartIndex === null) return;
    const queryLen = mentionQuery?.length ?? 0;
    const prefix = value.slice(0, mentionStartIndex);
    const suffix = value.slice(mentionStartIndex + 1 + queryLen);
    setValue(`${prefix}${suffix}`);
    setMentionQuery(null);
    setMentionStartIndex(null);

    // Attach the file's contents as a context attachment.
    if (projectRoot) {
      try {
        const content = await invoke<string>("kode_read_file", { root: projectRoot, path });
        const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setAttachments((current) => [
          ...current,
          { type: "file", id, mediaType: "text/plain", filename: path, url: "", text: content },
        ]);
      } catch {
        // Unreadable file — leave it out.
      }
    }
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const newPos = prefix.length;
        el.focus();
        el.setSelectionRange(newPos, newPos);
        resize();
      }
    });
  };

  // Picked commands, skills and connectors show as chips, not text. On send
  // they go in front of the message (`/review /github …`), command first.
  const [tokens, setTokens] = useState<SlashEntry[]>([]);
  const addToken = (entry: SlashEntry) =>
    setTokens((current) =>
      entry.kind === "connector"
        ? current.some((t) => t.id === entry.id)
          ? current
          : [...current, entry]
        : [entry, ...current.filter((t) => t.kind === "connector")],
    );
  const tokenPrefix = () => {
    const ordered = [
      ...tokens.filter((t) => t.kind !== "connector"),
      ...tokens.filter((t) => t.kind === "connector"),
    ];
    return ordered.map((t) => `/${t.name}`).join(" ");
  };

  const handleSelectSlash = (entry: SlashEntry) => {
    // Remove the `/query` being typed; the pick becomes a chip.
    const typedEnd = slashStart + 1 + (slashQuery?.length ?? 0);
    const before = value.slice(0, slashStart);
    const after = value.slice(typedEnd).replace(/^ /, "");
    const text = `${before}${after}`;
    addToken(entry);
    setValue(text);
    setSlashQuery(null);
    setSlashActiveIndex(0);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        const pos = before.length;
        el.focus();
        el.setSelectionRange(pos, pos);
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
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      const query = match[1];
      setMentionQuery(query);
      setMentionStartIndex(caret - query.length - 1);
      setMentionActiveIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(null);
    }

    // Slash picker: a leading `/name` (commands, skills, connectors), or a
    // `/name` after a space anywhere else (connectors only).
    const slashMatch = before.match(/(?:^|\s)\/([a-z0-9_-]*)$/i);
    if (slashMatch) {
      const query = slashMatch[1] ?? "";
      setSlashQuery(query);
      setSlashStart(caret - query.length - 1);
      setSlashActiveIndex(0);
    } else {
      setSlashQuery(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashQuery !== null && slashCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActiveIndex((i) => (i + 1) % slashCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActiveIndex((i) => (i - 1 + slashCandidates.length) % slashCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = slashCandidates[slashActiveIndex] ?? slashCandidates[0];
        if (selected) handleSelectSlash(selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
    }
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex(
          (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected =
          mentionCandidates[mentionActiveIndex] ?? mentionCandidates[0];
        if (selected) {
          handlePickMention(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    // Backspace at the very start removes the last chip.
    if (
      e.key === "Backspace" &&
      tokens.length > 0 &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      setTokens((current) => current.slice(0, -1));
      return;
    }
    // ⌘S / Ctrl+S puts the draft aside for another chat.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!canvasControls && value.trim()) {
        stashDraft(value);
        setValue("");
        requestAnimationFrame(resize);
      }
      return;
    }
    // ⇧Tab cycles the Kode permission mode (like Claude Code).
    if (e.key === "Tab" && e.shiftKey && !hideAgentMode && onModeChange) {
      e.preventDefault();
      const cycle = KODE_AGENT_MODES.filter((m) => m.id !== "design").map(
        (m) => m.id,
      );
      const index = mode ? cycle.indexOf(mode) : -1;
      onModeChange(cycle[(index + 1) % cycle.length] ?? cycle[0]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // Settings → General: Enter sends, or only ⌘/Ctrl+Enter sends (plain
      // Enter then inserts a new line).
      if (sendOnEnter || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        submit();
      }
    }
  };

  const canSend =
    (value.trim().length > 0 ||
      attachments.length > 0 ||
      tokens.length > 0 ||
      (!canvasControls && annotations.length > 0)) &&
    (!loading || queueWhileLoading);
  const setModel = (nextModelId: string) => {
    setUncontrolledModelId(nextModelId);
    onModelChange?.(nextModelId);
  };

  return (
    <div className="w-full">
      {topBar ? (
        <div className="relative z-20 -mb-[2px] mx-10 flex items-start gap-2 rounded-t-[18px] border border-b-0 border-black/[0.08] bg-[#efeaf6] px-3.5 py-2.5 dark:border-white/[0.07] dark:bg-[#0d0d0f]">
          {topBar}
        </div>
      ) : null}
      <div
        onDragOver={(e) => {
          if (!canDrop(e.dataTransfer.types)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dropActive) setDropActive(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false);
        }}
        onDrop={(e) => void handleDrop(e)}
        className={cn(
          "liquid-glass-composer relative z-10 rounded-[28px] transition-shadow",
          compact && "!backdrop-blur-2xl dark:!bg-black/55",
          dropActive && "ring-2 ring-purple-500/50",
        )}
      >
        <div className={compact ? "px-2.5 py-1.5" : "p-3.5"}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {tokens.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {tokens.map((token) => (
              <span
                key={token.id}
                title={token.description}
                className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/[0.1] py-0.5 pr-1 pl-2 text-label text-foreground/90"
              >
                {token.kind === "connector" ? (
                  <img src={getConnectorLogoUrl(token.name)} alt="" className="size-3.5 shrink-0 object-contain" />
                ) : token.kind === "skill" ? (
                  <Box size={12} className="shrink-0 text-purple-400" />
                ) : (
                  <SlashCommandIcon size={12} />
                )}
                <span>{tokenLabel(token)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${tokenLabel(token)}`}
                  onClick={() => setTokens((current) => current.filter((t) => t.id !== token.id))}
                  className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {!canvasControls && annotations.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {annotations.map((note) => (
              <span
                key={note.id}
                title={note.note || "No note"}
                className="flex max-w-full items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-500/[0.08] py-0.5 pr-1 pl-2 text-label"
              >
                <MessageSquarePlus size={11} className="shrink-0 text-purple-500" />
                <span className="truncate text-foreground/80">{annotationTitle(note)}</span>
                {note.note ? (
                  <span className="max-w-40 truncate text-muted-foreground">· {note.note}</span>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove note"
                  onClick={() => removeAnnotation(note.id)}
                  className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
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
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium"
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
                  className="ml-0.5 rounded-full p-0.5 kontinue-hover transition-colors cursor-pointer"
                >
                  <X size={11} />
                </button>
              </span>
            )}

            {webSearchEnabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/30 px-2.5 py-0.5 text-caption font-medium text-purple-700 dark:text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                <Globe
                  size={12}
                  className="text-purple-600 dark:text-purple-300"
                />
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

        {/* Slash command / skill picker */}
        {slashQuery !== null ? (
          <SlashPicker
            entries={slashCandidates}
            activeIndex={slashActiveIndex}
            onHoverIndex={setSlashActiveIndex}
            onSelect={handleSelectSlash}
          />
        ) : null}

        {/* File mention menu */}
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-4 z-50 mb-2 w-80 rounded-2xl liquid-glass-dropdown p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(168,85,247,0.2)] border border-purple-500/30">
            <div className="truncate px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80">
              {mentionFolder ? `Files · ${mentionFolder}/` : "Files"}
            </div>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {mentionCandidates.map((entry, idx) => {
                const isSelected = idx === mentionActiveIndex;
                const showParent = entry.parent && entry.parent !== mentionFolder;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handlePickMention(entry);
                    }}
                    onMouseEnter={() => setMentionActiveIndex(idx)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "kontinue-menu-active font-medium"
                        : "text-foreground hover:bg-purple-500/10",
                    )}
                  >
                    {entry.isDir ? (
                      <Folder size={13} className="shrink-0 text-purple-400" />
                    ) : (
                      <FileText size={13} className="shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono">{entry.name}</span>
                      {showParent ? (
                        <span className="block truncate text-micro text-muted-foreground">{entry.parent}</span>
                      ) : null}
                    </span>
                    {entry.isDir ? <ChevronRight size={12} className="shrink-0 text-muted-foreground" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={cn(
            compact &&
              "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5",
            compact && (fieldGrown ? "items-end" : "items-center"),
          )}
        >
        {/* Textarea with Highlight Mirror Overlay */}
        <div
          className={cn(
            "relative w-full",
            compact
              ? "col-start-2 row-start-1 min-h-8 max-h-[140px]"
              : "min-h-[64px] max-h-[260px]",
          )}
        >
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words font-sans",
              compact
                ? "px-1 py-0 text-lead leading-8"
                : "px-2.5 pt-1.5 text-[15px] leading-relaxed",
            )}
          >
            {renderHighlightedTokens(
              value,
              installedProviders,
              catalogProviders,
            )}
            {value.endsWith("\n") ? "\n " : ""}
          </div>

          <textarea
            ref={ref}
            value={value}
            rows={1}
            onChange={handleInputChange}
            onPaste={(e) => {
              // ⌘V a screenshot or copied files: attach them instead of pasting text.
              const files = Array.from(e.clipboardData.files);
              if (files.length === 0) return;
              e.preventDefault();
              void addFiles(files);
            }}
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
              compact
                ? "relative z-10 h-8 min-h-8 max-h-[140px] w-full resize-none overflow-y-auto bg-transparent px-1 py-0 text-lead leading-8 font-sans focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                : "relative z-10 min-h-[64px] max-h-[260px] w-full resize-none bg-transparent px-2.5 pt-1.5 text-[15px] leading-relaxed font-sans focus:outline-none disabled:cursor-not-allowed disabled:opacity-55",
              value.length > 0
                ? "text-transparent caret-zinc-900 dark:caret-white"
                : "text-zinc-900 dark:text-foreground placeholder:text-zinc-400 dark:placeholder:text-foreground/35",
            )}
          />
        </div>

        <div
          className={cn(
            compact
              ? "contents"
              : "mt-1.5 flex items-center justify-between gap-2",
          )}
        >
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
                      : "border border-transparent text-zinc-600 dark:text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ImageIcon
                    size={12}
                    className={
                      canvasControls.mode === "image"
                        ? "text-purple-400"
                        : "text-muted-foreground"
                    }
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
                      : "border border-transparent text-zinc-600 dark:text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Video
                    size={12}
                    className={
                      canvasControls.mode === "video"
                        ? "text-purple-400"
                        : "text-muted-foreground"
                    }
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
                    <span className="font-semibold text-purple-200">
                      {canvasControls.aspectRatio}
                    </span>
                    <ChevronDown size={11} className="text-purple-300 ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  sideOffset={8}
                  className="w-36 p-1 rounded-2xl liquid-glass-dropdown"
                >
                  <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80">
                    Aspect Ratio
                  </div>
                  {ASPECT_RATIOS.map((r) => {
                    const isSelected = canvasControls.aspectRatio === r.value;
                    return (
                      <DropdownMenuItem
                        key={r.value}
                        onClick={() =>
                          canvasControls.onAspectRatioChange(r.value)
                        }
                        className={cn(
                          "justify-between text-xs font-medium cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors",
                          isSelected
                            ? "kontinue-menu-active font-medium"
                            : "text-foreground kontinue-hover",
                        )}
                      >
                        <span>{r.label}</span>
                        {isSelected && (
                          <Check
                            size={12}
                            className="text-purple-400 shrink-0"
                          />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Model Picker Popover */}
              <ModelPickerPopover
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
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
                      <span className="font-semibold text-purple-200">
                        {formatDuration(canvasControls.duration ?? 5)}
                      </span>
                      <ChevronDown
                        size={11}
                        className="text-purple-300 ml-0.5"
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    sideOffset={8}
                    className="w-32 p-1 rounded-2xl liquid-glass-dropdown"
                  >
                    <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80">
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
                              ? "kontinue-menu-active font-medium"
                              : "text-foreground kontinue-hover",
                          )}
                        >
                          <span>{formatDuration(d)}</span>
                          {isSelected && (
                            <Check
                              size={12}
                              className="text-purple-400 shrink-0"
                            />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "flex min-w-0 items-center gap-1",
                compact && "col-start-1 row-start-1",
              )}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Add to chat"
                    className={cn(
                      "flex size-7.5 items-center justify-center rounded-full liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground cursor-pointer",
                    )}
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
                    onClick={() => {
                      setValue("/");
                      setSlashQuery("");
                      setSlashActiveIndex(0);
                      requestAnimationFrame(() => ref.current?.focus());
                    }}
                  >
                    <SlashCommandIcon size={14} />
                    <span>Commands</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon size={14} strokeWidth={1.25} />
                    <span>Add files or photos</span>
                  </DropdownMenuItem>
                  {onDropChat && contextChats.length > 0 ? (
                    <ChatContextMenu
                      chats={contextChats}
                      onPick={(chat) => void attachChat(chat)}
                    />
                  ) : null}
                  {canvasControls ? null : (
                    <StashMenu
                      onUse={(text) => {
                        setValue((prev) =>
                          prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text,
                        );
                        requestAnimationFrame(() => {
                          ref.current?.focus();
                          resize();
                        });
                      }}
                    />
                  )}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Blocks size={14} strokeWidth={1.25} />
                      <span>Connectors</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={8}
                      className="w-56 p-1.5"
                    >
                      {(() => {
                        const isConnected = (provider: string) =>
                          Boolean(
                            connectorsQuery?.some(
                              (c) => c.provider === provider && c.connected,
                            ),
                          );
                        const connected = CONNECTORS_CATALOG.filter((conn) =>
                          isConnected(conn.provider),
                        );
                        const row = (
                          conn: (typeof CONNECTORS_CATALOG)[number],
                          linked: boolean,
                        ) => (
                          <DropdownMenuItem
                            key={conn.provider}
                            onClick={() => {
                              if (linked) {
                                addToken({
                                  id: `connector:${conn.provider}`,
                                  name: conn.provider,
                                  description: conn.name,
                                  kind: "connector",
                                  connected: true,
                                });
                                requestAnimationFrame(() => ref.current?.focus());
                              } else {
                                const url = `https://chat.kontinueai.com/api/connectors/${conn.provider}/start`;
                                void openUrl(url).catch(() => {
                                  window.open(url, "_blank");
                                });
                              }
                            }}
                            className="group/conn gap-2.5 px-2 py-1.5"
                          >
                            <img
                              src={getConnectorLogoUrl(conn.provider)}
                              alt=""
                              className={cn(
                                "size-4 shrink-0 object-contain",
                                !linked &&
                                  "opacity-60 group-data-[highlighted]/conn:opacity-100",
                              )}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-xs",
                                !linked && "text-muted-foreground",
                              )}
                            >
                              {conn.name}
                            </span>
                            {linked ? (
                              <span
                                title="Connected"
                                className="size-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                              />
                            ) : (
                              <span className="text-caption text-muted-foreground/0 transition-colors group-data-[highlighted]/conn:text-muted-foreground">
                                Connect
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                        // Only connected apps; connecting more lives in Manage connectors.
                        return connected.length > 0 ? (
                          <>{connected.map((conn) => row(conn, true))}</>
                        ) : (
                          <p className="px-2 py-1.5 text-label text-muted-foreground">
                            No apps connected yet.
                          </p>
                        );
                      })()}
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
                  {/* Kode: the agent searches the web itself and reasoning lives in the
                  reasoning picker, so these toggles are Home-only. */}
                  {hideAgentMode ? (
                    <>
                      <DropdownMenuItem
                        onClick={toggleWebSearch}
                        className={cn(
                          "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                          webSearchEnabled
                            ? "kontinue-menu-active font-medium"
                            : "kontinue-hover",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Globe
                            size={14}
                            strokeWidth={1.25}
                            className={
                              webSearchEnabled
                                ? "text-purple-400"
                                : "text-foreground/70"
                            }
                          />
                          <span>Web search</span>
                        </div>
                        {webSearchEnabled ? (
                          <Check size={14} className="text-purple-400" />
                        ) : (
                          <span className="text-micro uppercase text-foreground/35 font-mono">
                            Off
                          </span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={toggleReasoning}
                        className={cn(
                          "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                          reasoningEnabled
                            ? "kontinue-menu-active font-medium"
                            : "kontinue-hover",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Brain
                            size={14}
                            strokeWidth={1.25}
                            className={
                              reasoningEnabled
                                ? "text-purple-400"
                                : "text-foreground/70"
                            }
                          />
                          <span>Thinking</span>
                        </div>
                        {reasoningEnabled ? (
                          <Check size={14} className="text-purple-400" />
                        ) : (
                          <span className="text-micro uppercase text-foreground/35 font-mono">
                            Off
                          </span>
                        )}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {/* Agents (personas) are for the Kontinue chat; Kode is a coding agent. */}
                  {hideAgentMode ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Bot size={14} strokeWidth={1.25} />
                      <span>Agents</span>
                      {activeAgent && (
                        <span className="ml-auto text-caption font-medium text-purple-400 truncate max-w-[80px]">
                          {activeAgent.name}
                        </span>
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      sideOffset={8}
                      className="w-64 p-1"
                    >
                      <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80">
                        Agents
                      </div>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => setSelectedAgentId(null)}
                        className={cn(
                          "justify-between cursor-pointer rounded-lg px-2 py-1.5 transition-colors",
                          selectedAgentId === null
                            ? "kontinue-menu-active font-medium"
                            : "kontinue-hover",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Bot
                            size={14}
                            strokeWidth={1.25}
                            className={
                              selectedAgentId === null
                                ? "text-purple-400 shrink-0"
                                : "text-muted-foreground shrink-0"
                            }
                          />
                          <span className="font-normal text-xs">
                            Standard Assistant
                          </span>
                        </div>
                        {selectedAgentId === null && (
                          <Check
                            size={12}
                            className="text-purple-400 shrink-0"
                          />
                        )}
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      <HoverInfoProvider>
                      {AGENTS.map((agent) => {
                        const isSelected = selectedAgentId === agent.id;
                        const IconComponent = getAgentIcon(agent.id);
                        return (
                          <HoverInfo key={agent.id} title={agent.name} description={agent.description} icon={<IconComponent size={13} />}>
                          <DropdownMenuItem
                            onClick={() => setSelectedAgentId(agent.id)}
                            className={cn(
                              "justify-between items-start py-2 cursor-pointer rounded-lg px-2 transition-colors",
                              isSelected
                                ? "kontinue-menu-active font-medium"
                                : "kontinue-hover",
                            )}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 pr-2">
                              <div
                                className="size-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                                style={{
                                  backgroundColor: `${agent.color}25`,
                                  color: agent.color,
                                }}
                              >
                                <IconComponent size={12} />
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <span
                                  className={cn(
                                    "font-medium text-xs block truncate",
                                    isSelected
                                      ? "text-purple-100"
                                      : "text-foreground",
                                  )}
                                >
                                  {agent.name}
                                </span>
                                <p
                                  className={cn(
                                    "text-caption leading-tight line-clamp-1",
                                    isSelected
                                      ? "text-purple-300/80"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {agent.description}
                                </p>
                              </div>
                            </div>
                            {isSelected && (
                              <Check
                                size={12}
                                className="text-purple-400 shrink-0 mt-1"
                              />
                            )}
                          </DropdownMenuItem>
                          </HoverInfo>
                        );
                      })}
                      </HoverInfoProvider>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              {(() => {
                const controls = (
                  <>
              {/* Model Picker Popover (supports both Home AVAILABLE_MODELS and Kode KODE_MODELS) */}
              <ModelPickerPopover
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
                models={models}
                selectedModelId={modelId}
                onSelectModel={(selected) => {
                  setModel(selected.id);
                }}
                onOpenSettings={onOpenConnectors}
                // Kode surface: plan locks, usage hints and Fast mode.
                kodePlan={!hideAgentMode ? planTier : undefined}
              />

              {/* Execution mode (Kode) */}
              {!hideAgentMode && <KodeModeMenu mode={mode} onModeChange={onModeChange} />}

              {/* Reasoning / Thinking: Popover in Kode (matching Image 1), Toggle in Home */}
              {!hideAgentMode ? (
                <KodeReasoningPopover
                  modelId={modelId}
                  modelName={models?.find((m) => m.id === modelId)?.name}
                  reasoning={chatReasoning}
                  contextWindow={chatContextWindow}
                  resolvedWindow={resolvedContextWindow}
                  onReasoningChange={onChatReasoningChange}
                  onContextWindowChange={onChatContextWindowChange}
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
                      ? "kontinue-capsule font-medium text-purple-900 dark:text-purple-100"
                      : "liquid-glass-pill text-zinc-700 dark:text-foreground/70 hover:text-zinc-950 dark:hover:text-foreground",
                  )}
                >
                  <Brain
                    size={13}
                    className={cn(
                      "transition-colors",
                      reasoningEnabled
                        ? "text-purple-600 dark:text-purple-300"
                        : "text-muted-foreground",
                    )}
                  />
                  <span>Thinking</span>
                  <span
                    className={cn(
                      "text-micro font-mono uppercase tracking-wider font-bold",
                      reasoningEnabled
                        ? "text-purple-700 dark:text-purple-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {reasoningEnabled ? "On" : "Off"}
                  </span>
                </button>
              )}
                  </>
                );
                if (compact) {
                  return bannerSlot
                    ? createPortal(
                        // Keyed by mode: when the chips change width the old ones are
                        // replaced, not moved. macOS WebKit didn't repaint the area a
                        // moved chip left, which drew a second "High · 256k".
                        <div key={mode ?? "none"} className="flex min-w-0 flex-1 items-center gap-1 [&_button]:!h-6 [&_button]:!rounded-md [&_button]:!border-transparent [&_button]:!bg-transparent [&_button]:!px-1 [&_button]:!text-caption [&_button]:!font-normal [&_button]:!shadow-none">
                          {controls}
                          <div className="ml-auto shrink-0">{trailing}</div>
                        </div>,
                        bannerSlot,
                      )
                    : null;
                }
                return controls;
              })()}
            </div>
          )}

          {/* Right: context, dictate + send */}
          <div
            className={cn(
              "flex items-center gap-1.5",
              compact && "col-start-3 row-start-1",
            )}
          >
            {canvasControls?.credits !== undefined && (
              <span className="text-xs text-muted-foreground font-medium px-1.5">
                {canvasControls.credits} credits
              </span>
            )}
            {!compact ? trailing : null}
            <DictateButton
              onText={(text) => {
                setValue((prev) =>
                  prev.trim() ? `${prev.trimEnd()} ${text}` : text,
                );
                requestAnimationFrame(() => {
                  ref.current?.focus();
                  resize();
                });
              }}
            />
            {loading && queueWhileLoading && canSend ? (
              <button
                type="button"
                onClick={submit}
                aria-label="Queue message"
                title="Queue: sends when Kode finishes this step (Enter)"
                className="kontinue-3d flex size-7.5 cursor-pointer items-center justify-center rounded-full text-foreground/80 hover:text-foreground"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={loading ? onStop : submit}
              disabled={loading ? !onStop : !canSend}
              aria-label={loading ? "Stop" : "Send"}
              className="flex size-7.5 items-center justify-center rounded-full transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              bg-purple-600 dark:bg-purple-600 text-white shadow-[0_4px_14px_rgba(147,51,234,0.35),inset_0_1px_1px_rgba(255,255,255,0.3)]
              enabled:hover:bg-purple-500 enabled:hover:shadow-[0_6px_20px_rgba(147,51,234,0.45)] enabled:hover:scale-105 enabled:active:scale-95 cursor-pointer"
            >
              {loading ? (
                <Square
                  size={13}
                  strokeWidth={2.5}
                  className="fill-current text-white"
                />
              ) : (
                <ArrowUp size={16} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
        </div>
        </div>
      </div>
      {compact || bottomBar ? (
        <div className="relative z-20 -mt-[2px] mx-10 flex items-center justify-between gap-1.5 rounded-b-[16px] border border-t-0 border-black/[0.08] bg-[#efeaf6] px-1.5 py-0.5 dark:border-white/[0.07] dark:bg-[#0d0d0f]">
          {compact ? (
            <div
              ref={setBannerSlot}
              className="flex min-w-0 flex-1 items-center"
            />
          ) : (
            bottomBar
          )}
        </div>
      ) : null}
    </div>
  );
}

/** + menu → Stashed drafts (⌘S stashes the draft). Hidden when empty. */
function StashMenu({ onUse }: { onUse: (text: string) => void }) {
  const stash = useStash();
  if (stash.length === 0) return null;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Archive size={14} strokeWidth={1.25} />
        <span>Stashed drafts</span>
        <span className="ml-auto text-caption font-medium text-purple-400">{stash.length}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={8} className="max-h-80 w-72 overflow-y-auto p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-caption text-muted-foreground">⌘S stashes what you're typing.</p>
        {stash.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => {
              onUse(item.text);
              removeStashed(item.id);
            }}
            className="group flex items-start gap-2 px-2 py-1.5"
          >
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-body whitespace-pre-wrap">{item.text}</span>
              <span className="block text-caption text-muted-foreground">
                {new Date(item.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </span>
            <button
              type="button"
              aria-label="Delete stashed draft"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeStashed(item.id);
              }}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-400"
            >
              <X size={12} />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Mic button: record → transcribe on the server → append to the input. */
function DictateButton({ onText }: { onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearTimer();
    if (!recorder) return;
    setState("transcribing");
    try {
      const text = await transcribe(await recorder.stop());
      if (text) onText(text);
      else setError("Didn't catch any speech.");
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Couldn't transcribe that.",
      );
    } finally {
      setState("idle");
    }
  };

  const start = async () => {
    setError(null);
    try {
      recorderRef.current = await startRecording();
      setSeconds(0);
      setState("recording");
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setSeconds(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_DICTATION_MS) void stop();
      }, 250);
    } catch {
      setError(
        "Microphone access is blocked. Allow it in System Settings → Privacy → Microphone.",
      );
    }
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      recorderRef.current?.cancel();
    },
    [],
  );

  const recording = state === "recording";
  return (
    <button
      type="button"
      title={error ?? (recording ? "Stop and transcribe" : "Dictate")}
      aria-label={recording ? "Stop dictation" : "Dictate"}
      disabled={state === "transcribing"}
      onClick={() => void (recording ? stop() : start())}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-full p-0 transition-colors",
        recording ? "h-8 w-auto gap-1 px-2" : "aspect-square size-8",
        recording
          ? "bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/40"
          : error
            ? "liquid-glass-pill text-amber-500"
            : "liquid-glass-pill text-zinc-700 hover:text-zinc-950 dark:text-foreground/70 dark:hover:text-foreground",
      )}
    >
      {state === "transcribing" ? (
        <Loader2 size={14} className="animate-spin" />
      ) : recording ? (
        <>
          <span className="size-2 animate-pulse rounded-full bg-rose-500" />
          <span className="font-mono text-caption tabular-nums">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        </>
      ) : (
        <Mic size={15} />
      )}
    </button>
  );
}

export default ChatInput;
