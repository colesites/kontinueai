import { useUser } from "@clerk/clerk-react";
import {
  canUseKodeModel,
  KODE_DEFAULT_MODEL_ID,
  KODE_MODELS,
  type KodePlan,
} from "@repo/ai/lib/kode";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ClipboardList,
  Copy,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { HiSpeakerWave } from "react-icons/hi2";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { CollapsibleUserText } from "@/components/chat/CollapsibleUserText";
import {
  type ChatTurn,
  DesktopChatTurnNavigator,
} from "@/components/chat/DesktopChatTurnNavigator";
import { ForkIcon } from "@/components/chat/ForkIcon";
import { TodoList } from "@/components/chat/TodoList";
import { CommandBlock, ToolStepView } from "@/components/chat/ToolStep";
import { KodeComposerBar } from "@/components/kode/KodeComposerBar";
import KodeSessionImport from "@/components/kode/KodeSessionImport";
import { PlanUsageLimits, UsageBar } from "@/components/usage/KodeUsageCard";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { getSettings, useAppSettings } from "@/lib/app-settings";
import { api } from "@/lib/convex-api";
import { type KodeToolStep, runKodeAgent } from "@/lib/kode-agent";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import type { KodeContentPart } from "@/lib/kode-chat";
import { publishChatContext } from "@/lib/kode-chat-context";
import {
  cliLoginCommand,
  cliModelDisplayName,
  cliNeedsLogin,
  cliPickerModels,
  cliPlanLabel,
  cliTodos,
  cliToolStep,
  cliVersionIssue,
  getCliSession,
  getProvider,
  parseCliModelId,
  runCliTurn,
  saveCliSession,
  useCliStore,
} from "@/lib/kode-cli";
import {
  type CompactionState,
  compactHistory,
  estimateTokens,
  needsCompaction,
} from "@/lib/kode-compact";
import {
  type ContextWindows,
  getContextWindow,
  loadContextWindows,
} from "@/lib/kode-context";
import type { DocSourceRef } from "@/lib/kode-docs";
import {
  buildContinuationBundle,
  type CodingProvider,
  diffSessionMessages,
  formatActivity,
  getImportContext,
  providerIcon,
  providerLabel,
  readCodingSession,
  readProjectState,
  type StoredImportContext,
  saveImportContext,
  sessionUpdatedAt,
} from "@/lib/kode-import";
import type { KodeAgentMode, KodeTodo } from "@/lib/kode-tools";
import {
  type KodeWorkspaceMessage,
  useKodeWorkspace,
} from "@/lib/kode-workspace";
import { useReasoningPreference } from "@/lib/use-reasoning-preference";

const KODE_STARTER_PROMPTS = [
  {
    icon: "🚀",
    title: "Build a component",
    prompt:
      "Create a modern, responsive React component with Tailwind CSS and smooth micro-interactions.",
  },
  {
    icon: "🔍",
    title: "Explain architecture",
    prompt:
      "Analyze the architecture of this project and explain data flow, state management, and conventions.",
  },
  {
    icon: "⚡",
    title: "Optimize performance",
    prompt:
      "Review performance bottlenecks in this codebase and suggest concrete optimizations.",
  },
  {
    icon: "🐛",
    title: "Debug & solve error",
    prompt:
      "I'm encountering an issue with type safety and state synchronization. Help me debug it.",
  },
];

type ChatMessage = KodeWorkspaceMessage & {
  // Ephemeral agent tool steps (live during a run, not persisted).
  toolSteps?: KodeToolStep[];
  // Plan/todos and docs sources — now persisted in Convex message metadata.
  toolTodos?: KodeTodo[];
  sources?: DocSourceRef[];
  // Imported retry/limit events render as system notices, not chat bubbles.
  notice?: boolean;
};

// Key for an in-flight send started on the home page before a chat exists.
const DRAFT_KEY = "draft";
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

// Real context size per chat, as reported by the provider on the last turn
// (prompt incl. system instructions + tools, plus the reply). Saved so the
// meter survives a restart; chats with no saved value fall back to a
// message-only estimate.
const CONTEXT_STORE_KEY = "kontinue.kode.context-tokens";

function readContextTokens(chatId: string): number | null {
  try {
    const store = JSON.parse(
      localStorage.getItem(CONTEXT_STORE_KEY) ?? "{}",
    ) as Record<string, number>;
    return typeof store[chatId] === "number" ? store[chatId] : null;
  } catch {
    return null;
  }
}

function saveContextTokens(chatId: string, tokens: number) {
  try {
    const store = JSON.parse(
      localStorage.getItem(CONTEXT_STORE_KEY) ?? "{}",
    ) as Record<string, number>;
    store[chatId] = tokens;
    localStorage.setItem(CONTEXT_STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: the meter just falls back to the estimate.
  }
}

const getModelName = (modelId: string) =>
  cliModelDisplayName(modelId) ??
  KODE_MODELS.find((model) => model.id === modelId)?.name ??
  "Kode 1.0";

const normalizePlanTier = (tier: string): KodePlan =>
  tier === "starter" || tier === "plus" || tier === "pro" || tier === "max"
    ? tier
    : "free";

const formatRelativeTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  return `${Math.floor(diff / day)} d ago`;
};

function formatMessageStamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  if (dayDiff < 7)
    return `${date.toLocaleDateString([], { weekday: "short" })}, ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function speakAloud(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    return;
  }
  const spoken = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!spoken) return;
  synth.speak(new SpeechSynthesisUtterance(spoken));
}

function MessageMeta({
  message,
  onRewind,
  onFork,
  onEdit,
}: {
  message: ChatMessage;
  onRewind?: () => void;
  onFork?: () => void;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const stamp = formatMessageStamp(message.createdAt);

  if (message.status === "thinking") return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — nothing to do.
    }
  };

  const copyButton = (
    <MessageAction
      tooltip="Copy"
      onClick={copy}
      className="size-5 text-foreground/40 hover:text-foreground"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </MessageAction>
  );
  const forkButton = onFork ? (
    <MessageAction
      tooltip="Fork from here"
      onClick={onFork}
      className="size-5 text-foreground/40 hover:text-foreground"
    >
      <ForkIcon />
    </MessageAction>
  ) : null;
  const time = stamp ? (
    <span className="px-1 text-[11px] text-foreground/35">{stamp}</span>
  ) : null;

  return (
    <MessageActions className="msg-actions -mt-0.5 w-fit gap-1.5 px-0.5 text-foreground/55 transition-opacity group-[.is-user]:ml-auto">
      {isUser ? (
        <>
          {time}
          {copyButton}
          {onRewind ? (
            <MessageAction
              tooltip="Rewind to here"
              onClick={onRewind}
              className="size-5 text-foreground/40 hover:text-foreground"
            >
              <RotateCcw size={13} />
            </MessageAction>
          ) : null}
          {forkButton}
          {onEdit ? (
            <MessageAction
              tooltip="Edit"
              onClick={onEdit}
              className="size-5 text-foreground/40 hover:text-foreground"
            >
              <Pencil size={13} />
            </MessageAction>
          ) : null}
        </>
      ) : (
        <>
          {copyButton}
          {forkButton}
          <MessageAction
            tooltip="Read aloud"
            onClick={() => speakAloud(message.content)}
            className="size-5 text-foreground/40 hover:text-foreground"
          >
            <HiSpeakerWave size={14} />
          </MessageAction>
          {time}
        </>
      )}
    </MessageActions>
  );
}

function isImportedTerminalDump(content: string) {
  return (
    /toolu_[A-Za-z0-9]+/.test(content) &&
    /background command|exit code|task-notification/i.test(content)
  );
}

function importedTerminalNotice(content: string) {
  const summary = content.match(
    /Background command[\s\S]*?\(exit code \d+\)/i,
  )?.[0];
  return `Ran: ${summary ?? content.replace(/\s+/g, " ").trim()}`;
}

function SystemNotice({
  content,
  createdAt,
}: {
  content: string;
  createdAt?: number;
}) {
  const normalized = content.trim();
  const warning = /limit|reached/i.test(normalized);
  const terminal = normalized.startsWith("Ran:");

  if (terminal) {
    return (
      <CommandBlock
        command={normalized.replace(/^Ran:\s*/, "")}
        status="done"
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center gap-2 py-1 text-center text-[11px] ${warning ? "text-amber-500/80" : "text-foreground/40"}`}
    >
      <span className="h-px w-8 bg-white/10" />
      {warning ? (
        <AlertTriangle size={11} className="shrink-0" />
      ) : (
        <Info size={11} className="shrink-0" />
      )}
      <span className="max-w-md truncate">{normalized}</span>
      {createdAt ? (
        <span className="shrink-0 text-foreground/25">
          {formatRelativeTime(createdAt)}
        </span>
      ) : null}
      <span className="h-px w-8 bg-white/10" />
    </div>
  );
}

const PlanView = () => {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName || "there";
  const planTier = normalizePlanTier(usePlanTier());
  const { reasoningEnabled: legacyReasoningEnabled, setReasoningEnabled } =
    useReasoningPreference();
  const { kodeContextWindow, kodeReasoning } = useAppSettings();
  // Reasoning comes from the picker (Settings store); "off" only where allowed.
  const reasoningEnabled = kodeReasoning !== "off";
  void legacyReasoningEnabled;
  // New sessions start from Settings → General defaults.
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const preferred = getSettings().defaultKodeModel;
    return preferred && KODE_MODELS.some((m) => m.id === preferred)
      ? preferred
      : KODE_DEFAULT_MODEL_ID;
  });
  // Settings → Providers: Claude / GPT models can run through the user's own
  // Claude Code / Codex CLI (their subscription) instead of Kode.
  // Settings → Providers: enabled models from the user's own Claude Code /
  // Codex / Cursor show in the picker after Kode's models.
  const cliStore = useCliStore();
  const cliStatuses = cliStore.statuses;
  const appSettings = useAppSettings();
  const kodeModels = useMemo(
    () => [...KODE_MODELS, ...cliPickerModels(appSettings, cliStore)],
    [appSettings, cliStore],
  );
  // A CLI model that was turned off (or whose CLI went away) falls back to Kode.
  useEffect(() => {
    if (!cliStatuses || !parseCliModelId(selectedModelId)) return;
    if (!kodeModels.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(KODE_DEFAULT_MODEL_ID);
    }
  }, [cliStatuses, kodeModels, selectedModelId]);
  const selectedCliId = parseCliModelId(selectedModelId)?.instanceId;
  const selectedCli = selectedCliId
    ? (getProvider(selectedCliId, appSettings) ?? null)
    : null;
  // All in-flight state is keyed by chat id (or DRAFT_KEY for an unsaved home
  // chat) so multiple chats/projects can run concurrently and switching chats
  // shows the correct per-chat loading + overlay.
  const [pendingByChat, setPendingByChat] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [sendingChats, setSendingChats] = useState<Record<string, boolean>>({});
  // Per-chat flag: the summarizer is folding older turns to fit the model window.
  const [compactingChats, setCompactingChats] = useState<
    Record<string, boolean>
  >({});
  const [usageByChat, setUsageByChat] = useState<
    Record<string, ChatMessage["usage"]>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [seed, setSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  const [mode, setMode] = useState<KodeAgentMode>(() => {
    // Design mode isn't available yet; fall back to Supervised.
    const preferred = getSettings().defaultKodeMode;
    return preferred === "design" ? "supervised" : preferred;
  });
  // Per-model context windows (OpenRouter + Vercel gateway), loaded once.
  const [contextWindows, setContextWindows] = useState<ContextWindows>({});
  useEffect(() => {
    void loadContextWindows().then(setContextWindows);
  }, []);
  // Per-chat compaction summary cache + which chats have been compacted (for UI).
  const compactionByChat = useRef<Map<string, CompactionState>>(new Map());
  // Per-run AbortController so the Stop button can cancel an in-flight agent run.
  const abortByChat = useRef<Map<string, AbortController>>(new Map());
  const [compactedChats, setCompactedChats] = useState<Record<string, boolean>>(
    {},
  );
  const [showSummary, setShowSummary] = useState(false);
  // Run status + pending-question resolvers live in the cross-project agent
  // runtime so a run stays answerable (from the sidebar) even while the user is
  // viewing another project. The agent loop awaits these; Approve/Reject and the
  // option picker — in-chat or in the sidebar popover — resolve them.
  const runtime = useKodeAgentRuntime();
  const {
    openSettings,
    projects,
    chats,
    activeChatId,
    draftProjectId,
    createChatRecord,
    addMessageRecord,
    appendImportedMessages,
    selectChat,
    rewindAfter,
  } = useKodeWorkspace();

  // Resolve the on-disk root of the active chat's (or draft's) project, if any.
  const activeProjectId =
    (activeChatId
      ? chats.find((chat) => chat.id === activeChatId)?.projectId
      : draftProjectId) ?? null;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  // Continuation context for imported Claude Code / Codex sessions. Kept in
  // localStorage (per chat) and appended to the agent's system context so the
  // project state captured at import time keeps grounding later turns.
  const [importContext, setImportContext] =
    useState<StoredImportContext | null>(null);
  const [syncingImport, setSyncingImport] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Guards the auto-sync interval against overlapping manual/background syncs.
  const syncInFlight = useRef(false);
  useEffect(() => {
    setImportContext(activeChatId ? getImportContext(activeChatId) : null);
    setSyncError(null);
  }, [activeChatId]);

  const syncImportedSession = async (options?: { silent?: boolean }) => {
    if (!importContext || !activeChatId || syncInFlight.current) return;
    if (!importContext.sourcePath) {
      if (!options?.silent) {
        setSyncError("Re-import this session to enable syncing.");
      }
      return;
    }

    syncInFlight.current = true;
    setSyncingImport(true);
    if (!options?.silent) setSyncError(null);
    try {
      const session = await readCodingSession(
        importContext.provider as CodingProvider,
        importContext.sourcePath,
      );
      const importedCount =
        importContext.syncedMessageCount ?? importContext.messageCount;
      // Older imports have no fingerprint. Refresh their context, but do not
      // attempt an append: re-importing is required to enable incremental sync.
      const diff = importContext.lastMessageHash
        ? diffSessionMessages(
            session,
            importedCount,
            importContext.lastMessageHash,
          )
        : null;

      if (diff && diff.newMessages.length > 0) {
        await appendImportedMessages({
          chatId: activeChatId,
          expectedMessageCount: importedCount,
          model: importContext.model,
          messages: diff.newMessages,
        });
      }

      let project = null;
      if (importContext.projectPath) {
        try {
          project = await readProjectState(importContext.projectPath);
        } catch {
          project = null;
        }
      }

      const bundle = buildContinuationBundle(session, project);
      const next: StoredImportContext = {
        ...importContext,
        lastActivity: session.lastActivity,
        filesChanged: session.filesChanged,
        redactions: session.redactions,
        contextPrompt: bundle.contextPrompt,
        syncedAt: Date.now(),
        ...(diff
          ? {
              messageCount: diff.messageCount,
              syncedMessageCount: diff.messageCount,
              lastMessageHash: diff.lastMessageHash,
            }
          : {}),
      };
      saveImportContext(next);
      setImportContext(next);
      setSyncError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync the imported session.";
      setSyncError(message);
      // Stop background retries for imports that can only be fixed by
      // re-importing (changed transcript shape, divergent chat history).
      if (
        message.includes("Re-import") ||
        message.includes("out of sync") ||
        message.includes("appended safely")
      ) {
        const next = { ...importContext, autoSync: false };
        saveImportContext(next);
        setImportContext(next);
      }
    } finally {
      syncInFlight.current = false;
      setSyncingImport(false);
    }
  };

  const toggleAutoSync = () => {
    if (!importContext) return;
    const next = {
      ...importContext,
      autoSync: importContext.autoSync === false,
    };
    saveImportContext(next);
    setImportContext(next);
  };

  // Fall back to the imported session's captured project root so tools still
  // work in the first render, before the Convex chat → folder mapping arrives.
  const projectRoot =
    activeProject?.path ??
    (activeChatId ? (importContext?.projectPath ?? null) : null);

  const resolveApproval = runtime.resolveApproval;
  const resolveOptions = runtime.resolveOptions;

  const rewindMessage = async (messageId: string, text: string) => {
    setSeed((current) => ({ text, nonce: current.nonce + 1 }));
    try {
      await rewindAfter(messageId);
    } catch {
      // Ignore — Convex will surface its own error; the input is already seeded.
    }
  };

  const priorHistory = (index: number) =>
    messages.slice(0, index).flatMap((message) => {
      if (message.notice || !message.content) return [];
      if (message.role !== "user" && message.role !== "assistant") return [];
      return [{ role: message.role, content: message.content }];
    });

  const forkMessage = async (index: number) => {
    const slice = messages.slice(0, index + 1).filter((message) => {
      if (message.notice || !message.content) return false;
      return (
        !message.id.startsWith("user-") && !message.id.startsWith("assistant-")
      );
    });
    if (slice.length === 0) return;
    const title =
      chats.find((chat) => chat.id === activeChatId)?.title ?? "Chat";
    const chatId = await createChatRecord({
      title: `${title} fork`,
      projectId: activeProjectId,
    });
    for (const message of slice) {
      await addMessageRecord({
        chatId,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        model: message.modelId,
      });
    }
    selectChat(chatId);
  };

  const editMessage = async (
    index: number,
    messageId: string,
    next: string,
  ) => {
    const text = next.trim();
    if (!text) return;
    const history = priorHistory(index);
    const persisted =
      !messageId.startsWith("user-") && !messageId.startsWith("assistant-");
    if (persisted) await rewindAfter(messageId);
    setEditingMessageId(null);
    await submitPrompt(
      text,
      selectedModelId,
      undefined,
      undefined,
      undefined,
      history,
    );
  };

  const isKodeChat = Boolean(
    activeChatId && chats.some((chat) => chat.id === activeChatId),
  );

  const convexMessages = useQuery(
    api.kode.getMessages,
    isKodeChat && activeChatId ? { chatId: activeChatId } : "skip",
  );

  // General token budget for the signed-in user (daily + weekly). Used to block a
  // turn before it runs when the budget is exhausted.

  const persistedMessages = useMemo<ChatMessage[]>(
    () =>
      (convexMessages ?? []).map((message) => {
        const meta = message.metadata as
          | { model?: string; todos?: KodeTodo[]; sources?: DocSourceRef[] }
          | undefined;
        const isNotice = message.role === "system";
        return {
          id: message._id,
          role: isNotice
            ? "assistant"
            : message.role === "assistant"
              ? "assistant"
              : "user",
          content: message.content,
          modelId: meta?.model ?? selectedModelId,
          createdAt: message.createdAt,
          status: "complete" as const,
          notice: isNotice,
          toolTodos: meta?.todos,
          sources: meta?.sources,
        };
      }),
    [convexMessages, selectedModelId],
  );

  const currentKey = activeChatId ?? DRAFT_KEY;
  const overlay = pendingByChat[currentKey] ?? EMPTY_CHAT_MESSAGES;
  const messages = useMemo(
    () => [...persistedMessages, ...overlay],
    [persistedMessages, overlay],
  );
  const isCurrentSending = !!sendingChats[currentKey];
  const isCompacting = !!compactingChats[currentKey];
  const latestUsage = usageByChat[currentKey];
  const messagesLoading = activeChatId !== null && convexMessages === undefined;

  // Keep an imported chat in sync with its source transcript while it is open.
  // The interval only stats the file; a full parse + Convex append happens when
  // the transcript actually changed. Auto-sync can be turned off per chat.
  const syncNow = useEffectEvent((options?: { silent?: boolean }) =>
    syncImportedSession(options),
  );
  const sendingRef = useRef(isCurrentSending);
  useEffect(() => {
    sendingRef.current = isCurrentSending;
  }, [isCurrentSending]);
  useEffect(() => {
    const sourcePath = importContext?.sourcePath;
    if (!sourcePath) return;
    if (importContext.autoSync === false) return;
    if (!importContext.lastMessageHash) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled || syncInFlight.current || sendingRef.current) return;
      try {
        const updated = await sessionUpdatedAt(
          importContext.provider,
          sourcePath,
        );
        if (updated > (importContext.syncedAt ?? importContext.importedAt)) {
          await syncNow({ silent: true });
        }
      } catch {
        // Polling errors are non-fatal; a manual sync surfaces them.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    importContext?.sourcePath,
    importContext?.autoSync,
    importContext?.lastMessageHash,
    importContext?.syncedAt,
    importContext?.importedAt,
    importContext?.provider,
  ]);

  const submitPrompt = async (
    text: string,
    modelId = selectedModelId,
    attachments?: StagedAttachment[],
    sendReasoningEnabled?: boolean,
    modeOverride?: KodeAgentMode,
    historyOverride?: { role: "user" | "assistant"; content: string }[],
  ) => {
    // Approving a plan switches mode and sends in the same tick, so use the
    // override instead of the (not yet updated) state.
    const activeMode = modeOverride ?? mode;
    const key = activeChatId ?? DRAFT_KEY;
    if (sendingChats[key]) return;

    // Build what the model receives vs what we display/persist. The model gets
    // full file text + images (multimodal); the bubble shows a compact note.
    const imageAtts = (attachments ?? []).filter(
      (a) => a.mediaType.startsWith("image/") && a.url,
    );
    const fileAtts = (attachments ?? []).filter((a) => a.text);
    const fileBlocks = fileAtts
      .map(
        (a) => `\n\n[Attached file: ${a.filename}]\n\`\`\`\n${a.text}\n\`\`\``,
      )
      .join("");
    const modelText = `${text}${fileBlocks}`;
    const displayText = attachments?.length
      ? `${text}\n\n[Attached: ${attachments.map((a) => a.filename ?? "file").join(", ")}]`
      : text;
    const userContent: KodeContentPart[] | undefined =
      imageAtts.length > 0
        ? [
            { type: "text", text: modelText },
            ...imageAtts.map((a) => ({
              type: "image_url" as const,
              image_url: { url: a.url as string },
            })),
          ]
        : undefined;

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `user-${now}`,
      role: "user",
      content: displayText,
      modelId,
      createdAt: now,
    };

    const cliTarget = parseCliModelId(modelId);
    // The provider instance (Settings → Providers) that runs this model.
    const cliProvider = cliTarget
      ? (getProvider(cliTarget.instanceId) ?? null)
      : null;
    if (cliTarget && !cliProvider) {
      setPendingByChat((current) => ({
        ...current,
        [key]: [
          userMessage,
          {
            id: `assistant-${now}`,
            role: "assistant",
            content:
              "This provider was removed. Pick another model, or add it again in Settings → Providers.",
            modelId,
            status: "error",
          },
        ],
      }));
      return;
    }
    if (!cliProvider && !canUseKodeModel(modelId, planTier)) {
      setPendingByChat((current) => ({
        ...current,
        [key]: [
          userMessage,
          {
            id: `assistant-${now}`,
            role: "assistant",
            content: `${getModelName(modelId)} is not available on your current plan.`,
            modelId,
            status: "error",
          },
        ],
      }));
      return;
    }

    // Usage limits are enforced by the Kontinue server for every model call
    // (apps/web/src/app/api/kode/chat); its message is shown if a limit is hit.

    const thinkingMessage: ChatMessage = {
      id: `assistant-${now}`,
      role: "assistant",
      content: "",
      modelId,
      createdAt: now,
      status: "thinking",
    };

    const abortController = new AbortController();
    abortByChat.current.set(key, abortController);

    setSendingChats((current) => ({ ...current, [key]: true }));
    runtime.setRunning(key, true);
    setPendingByChat((current) => ({
      ...current,
      [key]: [userMessage, thinkingMessage],
    }));

    // History only exists for an already-active chat (draft sends start empty).
    const history =
      historyOverride ??
      persistedMessages.reduce<
        { role: "user" | "assistant"; content: string }[]
      >((items, message) => {
        if (message.notice) return items;
        if (message.content) {
          items.push({ role: message.role, content: message.content });
        }
        return items;
      }, []);

    let runKey = key;
    let chatId = activeChatId;
    try {
      if (!chatId) {
        chatId = await createChatRecord({
          title: text,
          projectId: draftProjectId,
        });
        // Switch to the new chat and migrate the draft overlay/sending state to
        // its id in the same render so the view never drops back to home.
        selectChat(chatId);
        const newId = chatId;
        setPendingByChat((current) => {
          const next = { ...current };
          next[newId] = next[DRAFT_KEY] ?? [userMessage, thinkingMessage];
          delete next[DRAFT_KEY];
          return next;
        });
        setSendingChats((current) => {
          const next = { ...current };
          next[newId] = true;
          delete next[DRAFT_KEY];
          return next;
        });
        runtime.setRunning(newId, true);
        runtime.clearChat(DRAFT_KEY);
        // Re-key the abort controller from the draft slot to the real chat id so
        // the Stop button (which looks up by the now-active chat id) finds it.
        abortByChat.current.delete(key);
        abortByChat.current.set(newId, abortController);
        runKey = newId;
      }

      // Live-update the in-flight assistant bubble as reasoning/content tokens
      // stream in, so the chain-of-thought fills in progressively.
      const assistantId = thinkingMessage.id;
      const applyDelta = (field: "reasoning" | "content", delta: string) => {
        // Once stopped, ignore any tokens still arriving from the orphaned stream.
        if (abortController.signal.aborted) return;
        setPendingByChat((current) => ({
          ...current,
          [runKey]: (current[runKey] ?? []).map((item) =>
            item.id === assistantId
              ? { ...item, [field]: (item[field] ?? "") + delta }
              : item,
          ),
        }));
      };

      // Upsert a tool step into the in-flight assistant bubble so its approval /
      // status card renders and updates as the agent runs.
      const upsertToolStep = (step: KodeToolStep) => {
        setPendingByChat((current) => ({
          ...current,
          [runKey]: (current[runKey] ?? []).map((item) => {
            if (item.id !== assistantId) return item;
            const steps = item.toolSteps ?? [];
            const idx = steps.findIndex((s) => s.id === step.id);
            const nextSteps =
              idx >= 0
                ? steps.map((s) => (s.id === step.id ? step : s))
                : [...steps, step];
            return { ...item, toolSteps: nextSteps };
          }),
        }));
        // Mirror pending questions into the cross-project runtime so the sidebar
        // can surface "needs you" and answer it remotely.
        runtime.syncStep(runKey, step);
      };

      // The model's latest plan/todos this turn (live in the bubble + persisted).
      let latestTodos: KodeTodo[] = [];
      const upsertTodos = (todos: KodeTodo[]) => {
        latestTodos = todos;
        setPendingByChat((current) => ({
          ...current,
          [runKey]: (current[runKey] ?? []).map((item) =>
            item.id === assistantId ? { ...item, toolTodos: todos } : item,
          ),
        }));
      };

      // Your-subscription turn: run the local Claude Code / Codex CLI. Never
      // touches the Kontinue server and is not counted in Kode usage.
      if (cliTarget && cliProvider) {
        if (!projectRoot) {
          throw new Error(
            "Open a project folder to use your Claude Code or Codex subscription.",
          );
        }
        const versionIssue = cliVersionIssue(
          cliTarget.model,
          cliProvider,
          cliStatuses,
        );
        if (versionIssue) {
          throw new Error(
            `${versionIssue} Use Update in Settings → Providers, or pick one of Kode's models.`,
          );
        }
        const cliChatId = chatId;
        const sessionId = getCliSession(cliChatId, cliProvider.id);
        // A fresh CLI session in an existing chat gets the earlier turns as context.
        let prompt = modelText;
        if (!sessionId) {
          const earlier = history
            .map(
              (m) =>
                `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
            )
            .join("\n\n")
            .slice(-24000);
          const preface = [
            importContext?.contextPrompt,
            earlier ? `Earlier conversation in this chat:\n\n${earlier}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");
          if (preface) prompt = `${preface}\n\n---\n\n${modelText}`;
        }
        if (imageAtts.length > 0) {
          applyDelta(
            "content",
            "_Images are not sent to the CLI; only text is._\n\n",
          );
        }

        const steps = new Map<string, KodeToolStep>();
        const notices: string[] = [];
        const result = await runCliTurn({
          instance: cliProvider,
          root: projectRoot,
          prompt,
          sessionId,
          model: cliTarget.model,
          mode: activeMode,
          signal: abortController.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "session":
                saveCliSession(cliChatId, cliProvider.id, event.sessionId);
                break;
              case "text":
                applyDelta("content", event.delta);
                break;
              case "reasoning":
                applyDelta("reasoning", event.delta);
                break;
              case "toolStart":
              case "toolEnd": {
                const step = cliToolStep(event, steps.get(event.id));
                steps.set(event.id, step);
                upsertToolStep(step);
                break;
              }
              case "todos":
                upsertTodos(cliTodos(event.items));
                break;
              case "notice":
                notices.push(event.message);
                break;
            }
          },
        });
        if (result.sessionId)
          saveCliSession(cliChatId, cliProvider.id, result.sessionId);
        if (result.error) {
          // Common causes: a signed-out CLI, or one too old for this model.
          const signedOut =
            /log ?in|logged out|not logged|authenticat|\/login/i.test(
              result.error,
            );
          const badModel = /model/i.test(result.error);
          const hint = signedOut
            ? `Sign in from Settings → Providers → ${cliProvider.label}${cliLoginCommand(cliProvider) ? ` (or run \`${cliLoginCommand(cliProvider)}\` in a terminal)` : ""}, then send again.`
            : badModel
              ? `${cliProvider.label} could not use ${getModelName(modelId)}. It may be too old (use Update in Settings → Providers) or your plan may not include this model.`
              : "";
          throw new Error(hint ? `${result.error}\n\n${hint}` : result.error);
        }

        const noticeText = notices.length
          ? `\n\n> ${notices.join("\n> ")}`
          : "";
        const content =
          (result.text.trim() + noticeText).trim() ||
          (result.stopped ? "_Stopped._" : "");
        await addMessageRecord({
          chatId,
          role: "user",
          content: displayText,
          model: modelId,
        });
        await addMessageRecord({
          chatId,
          role: "assistant",
          content,
          model: modelId,
          todos: latestTodos.length > 0 ? latestTodos : undefined,
        });
        setPendingByChat((current) => {
          const next = { ...current };
          delete next[runKey];
          return next;
        });
        return;
      }

      // Auto-compaction: if the conversation is near the model's window, summarize
      // older turns and send [summary, ...recent] instead. Original messages stay.
      // Surface a "Compacting context…" indicator only when it will actually run
      // (summarizing a large history can take a moment).
      const window = getContextWindow(
        modelId,
        contextWindows,
        getSettings().kodeContextWindow,
      );
      if (needsCompaction(history, window)) {
        setCompactingChats((current) => ({ ...current, [runKey]: true }));
      }
      const { messages: sentHistory, compacted } = await compactHistory(
        history,
        window,
        modelId,
        {
          get: () => compactionByChat.current.get(runKey) ?? null,
          set: (state) => compactionByChat.current.set(runKey, state),
        },
      );
      setCompactingChats((current) => ({ ...current, [runKey]: false }));
      if (compacted) {
        setCompactedChats((current) => ({ ...current, [runKey]: true }));
      }

      const response = await runKodeAgent({
        // Fast mode (Settings / model picker); the server re-checks the plan.
        fast: getSettings().kodeFastMode,
        modelId,
        history: sentHistory,
        userText: modelText,
        userContent,
        mode: activeMode,
        projectRoot,
        extraSystemContext: importContext?.contextPrompt,
        reasoningEnabled: sendReasoningEnabled ?? reasoningEnabled,
        reasoningEffort: kodeReasoning === "off" ? undefined : kodeReasoning,
        onText: (delta) => applyDelta("content", delta),
        onReasoning: (delta) => applyDelta("reasoning", delta),
        onToolStep: upsertToolStep,
        requestApproval: (step) =>
          new Promise<boolean>((resolve) => {
            runtime.registerApproval(step.id, resolve);
          }),
        requestOptions: (step) =>
          new Promise<string[]>((resolve) => {
            runtime.registerOptions(step.id, resolve);
          }),
        onTodos: upsertTodos,
        signal: abortController.signal,
      });

      // Persist both turns only after the model responds — avoids a duplicate
      // user bubble during the wait and avoids saving an unanswered turn.
      await addMessageRecord({
        chatId,
        role: "user",
        content: displayText,
        model: modelId,
      });
      await addMessageRecord({
        chatId,
        role: "assistant",
        content: response.content,
        model: modelId,
        // Whole-turn token cost (summed across all agent iterations) — meters the
        // user's general daily + weekly token budget.
        tokens: response.tokensConsumed,
        sources: response.sources.length > 0 ? response.sources : undefined,
        todos: latestTodos.length > 0 ? latestTodos : undefined,
      });

      const finishedId = chatId;
      setUsageByChat((current) => ({
        ...current,
        [finishedId]: response.usage,
      }));
      if (response.usage?.totalTokens)
        saveContextTokens(finishedId, response.usage.totalTokens);
      // Clear this chat's overlay — Convex now renders the persisted turns
      // (with sources/todos from metadata).
      setPendingByChat((current) => {
        const next = { ...current };
        delete next[runKey];
        return next;
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Kode could not reach the model.";

      setPendingByChat((current) => ({
        ...current,
        [runKey]: (current[runKey] ?? []).map((item) =>
          item.role === "assistant"
            ? { ...item, content: message, status: "error" }
            : item,
        ),
      }));
    } finally {
      setSendingChats((current) => ({ ...current, [runKey]: false }));
      setCompactingChats((current) => ({ ...current, [runKey]: false }));
      abortByChat.current.delete(runKey);
      abortByChat.current.delete(key);
      runtime.clearChat(runKey);
    }
  };

  // Stop the in-flight run for the chat currently in view.
  const stopCurrentRun = () => {
    abortByChat.current.get(currentKey)?.abort();
  };

  // Whole-chat context usage. The persisted estimate (system prompt + every
  // message, all in Convex) is the cumulative floor that survives reloads. When the
  // provider reported real usage this session we TRUE UP to it (exact tokenizer vs
  // our chars/4 estimate) by taking the larger of the two — so the number is exact
  // during a session and a stable estimate after a reload, never resetting to 0 or
  // shrinking below the real conversation. The denominator follows the SELECTED
  // model's window, so switching models reprices the SAME conversation against the
  // new window (numerator unchanged) — like Codex / Claude Code. Only compaction
  // (kode-compact) shrinks it, not a new turn.
  // Empty chat → 0. Otherwise the provider's real count from the last turn
  // (this session, or saved), else an estimate from the messages alone.
  const reportedTokens =
    latestUsage?.totalTokens ??
    (activeChatId ? readContextTokens(activeChatId) : null);
  const usedTokens =
    messages.length === 0
      ? 0
      : (reportedTokens ??
        estimateTokens(messages) +
          (importContext
            ? Math.ceil(importContext.contextPrompt.length / 4)
            : 0));
  const contextWindow = getContextWindow(
    selectedModelId,
    contextWindows,
    kodeContextWindow,
  );
  useEffect(() => {
    publishChatContext({
      used: usedTokens,
      max: contextWindow,
      modelName: getModelName(selectedModelId),
    });
  }, [usedTokens, contextWindow, selectedModelId]);
  const inChat = activeChatId !== null || messages.length > 0;
  const [jumpSlot, setJumpSlot] = useState<HTMLDivElement | null>(null);
  const userTurns = useMemo<ChatTurn[]>(
    () =>
      messages
        .filter((message) => message.role === "user" && !message.notice)
        .map((message, index) => {
          const text = (message.content ?? "").replace(/\s+/g, " ").trim();
          return {
            id: `kode-turn-${message.id}`,
            preview: text
              ? text.length > 60
                ? `${text.slice(0, 60).trimEnd()}…`
                : text
              : `Message ${index + 1}`,
          };
        }),
    [messages],
  );
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden ${inChat ? "" : "px-6 pb-5"}`}
    >
      <div
        className={
          inChat
            ? // Full width so the conversation's scrollbar sits at the pane
              // edge. No mask here: a mask breaks backdrop blur on the
              // composer and the jump button.
              "flex min-h-0 w-full flex-1 flex-col"
            : "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center [justify-content:safe_center] overflow-y-auto py-6"
        }
      >
        {inChat && importContext ? (
          <div className="mx-auto mt-[4.5rem] mb-2 flex w-[min(48rem,calc(100%-3rem))] items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/[0.06] px-3 py-1.5 text-[11px] text-foreground/60">
            <img
              src={providerIcon(importContext.provider)}
              alt=""
              className="size-3.5 shrink-0 dark:invert-0 invert"
            />
            <span className="min-w-0 truncate">
              Imported from{" "}
              <span className="font-medium text-foreground/80">
                {providerLabel(importContext.provider)}
              </span>
              {importContext.lastActivity
                ? ` · last active ${formatActivity(importContext.lastActivity)}`
                : ""}
              {importContext.projectPath
                ? ` · ${importContext.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? "project"}`
                : " · no project attached"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="hidden text-foreground/35 sm:inline">
                context{" "}
                {formatActivity(
                  importContext.syncedAt ?? importContext.importedAt,
                )}
              </span>
              {importContext.redactions > 0 ? (
                <span className="text-foreground/40">
                  {importContext.redactions} secrets redacted
                </span>
              ) : null}
              {importContext.lastMessageHash ? (
                <>
                  <button
                    type="button"
                    onClick={toggleAutoSync}
                    title="Automatically append new Claude Code / Codex turns while this chat is open"
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-foreground/40 transition-colors hover:bg-white/[0.05] hover:text-foreground/70"
                  >
                    <span
                      className={`size-1.5 rounded-full ${importContext.autoSync === false ? "bg-foreground/25" : "bg-emerald-500"}`}
                    />
                    Auto {importContext.autoSync === false ? "off" : "on"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncImportedSession()}
                    disabled={syncingImport}
                    title="Read new turns from the source transcript and update the project context"
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-foreground/40 transition-colors hover:bg-white/[0.05] hover:text-foreground/70 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`size-3 ${syncingImport ? "animate-spin" : ""}`}
                    />
                    {syncingImport ? "Syncing" : "Sync"}
                  </button>
                </>
              ) : importContext.sourcePath ? (
                <button
                  type="button"
                  onClick={() => void syncImportedSession()}
                  disabled={syncingImport}
                  title="Refresh the imported context. Re-import the session to enable appending new turns."
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-foreground/40 transition-colors hover:bg-white/[0.05] hover:text-foreground/70 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-3 ${syncingImport ? "animate-spin" : ""}`}
                  />
                  {syncingImport ? "Refreshing" : "Refresh"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {syncError ? (
          <p
            className={`mx-auto mb-2 w-[min(48rem,calc(100%-3rem))] text-[10.5px] text-amber-500 ${importContext ? "" : "mt-[4.5rem]"}`}
          >
            {syncError}
          </p>
        ) : null}
        {!inChat ? (
          <div className="w-full text-center space-y-6 mb-6">
            <div className="flex items-center justify-center">
              <img
                src="/kontinueai.svg"
                alt="Kontinue AI"
                className="h-10 dark:invert-0 invert"
              />
            </div>
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
              How can I help you,{" "}
              <span className="font-bold text-purple-600 dark:text-purple-400">
                {firstName}
              </span>
              ?
            </h1>
            <div className="flex items-center justify-center">
              <KodeSessionImport
                projectPath={projectRoot}
                projectName={activeProject?.name ?? null}
              />
            </div>
          </div>
        ) : messages.length === 0 && messagesLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground/35" />
          </div>
        ) : (
          <Conversation className="min-h-0 flex-1 overflow-hidden">
            <ConversationContent
              className={`mx-auto w-full max-w-[51rem] gap-6 px-6 pb-28 ${importContext || syncError ? "pt-4" : "pt-[4.5rem]"}`}
            >
              {messages.map((message, index) =>
                message.notice || isImportedTerminalDump(message.content) ? (
                  <SystemNotice
                    key={message.id}
                    content={
                      message.notice
                        ? message.content
                        : importedTerminalNotice(message.content)
                    }
                    createdAt={message.createdAt}
                  />
                ) : (
                  <Message
                    from={message.role}
                    key={message.id}
                    id={
                      message.role === "user"
                        ? `kode-turn-${message.id}`
                        : undefined
                    }
                  >
                    <MessageContent>
                      {message.role === "assistant" ? (
                        <>
                          {(() => {
                            // Not every model emits reasoning tokens, and they
                            // arrive after a beat when they do. Only render the
                            // reasoning BOX when there's real content; while waiting,
                            // show a single clean shimmer header (no empty box).
                            const reasoningText = message.reasoning?.trim();
                            const isThinking = message.status === "thinking";
                            if (!reasoningText && !isThinking) return null;
                            return (
                              <ChainOfThought
                                defaultOpen={Boolean(reasoningText)}
                              >
                                <ChainOfThoughtHeader>
                                  {reasoningText ? (
                                    "Kode reasoning"
                                  ) : (
                                    <Shimmer>Kode is reasoning</Shimmer>
                                  )}
                                </ChainOfThoughtHeader>
                                {reasoningText ? (
                                  <ChainOfThoughtContent>
                                    <div className="rounded-xl border border-brand/15 bg-brand/5 p-3 text-sm leading-relaxed text-foreground/72">
                                      {reasoningText}
                                    </div>
                                  </ChainOfThoughtContent>
                                ) : null}
                              </ChainOfThought>
                            );
                          })()}

                          {message.toolSteps?.map((step) => (
                            <ToolStepView
                              key={step.id}
                              step={step}
                              onApprove={(id) => resolveApproval(id, true)}
                              onReject={(id) => resolveApproval(id, false)}
                              onOptions={resolveOptions}
                            />
                          ))}

                          {message.toolTodos && message.toolTodos.length > 0 ? (
                            <TodoList todos={message.toolTodos} />
                          ) : null}

                          {message.content ? (
                            <MessageResponse>{message.content}</MessageResponse>
                          ) : message.toolSteps?.length ? null : (
                            <div className="text-sm text-foreground/45">
                              Waiting for model response...
                            </div>
                          )}

                          {message.sources && message.sources.length > 0 ? (
                            <Sources>
                              <SourcesTrigger count={message.sources.length} />
                              <SourcesContent>
                                {message.sources.map((source) => (
                                  <Source
                                    key={source.url}
                                    href={source.url}
                                    title={source.title}
                                  />
                                ))}
                              </SourcesContent>
                            </Sources>
                          ) : null}
                        </>
                      ) : editingMessageId === message.id ? (
                        <div className="flex w-full min-w-[280px] flex-col gap-2">
                          <textarea
                            value={editDraft}
                            onChange={(event) =>
                              setEditDraft(event.target.value)
                            }
                            rows={3}
                            aria-label="Edit message"
                            className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMessageId(null)}
                              className="kontinue-3d rounded-full px-3 py-1 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void editMessage(index, message.id, editDraft)
                              }
                              className="kontinue-3d-primary rounded-full px-3 py-1 text-xs font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <CollapsibleUserText>
                          <MessageResponse>{message.content}</MessageResponse>
                        </CollapsibleUserText>
                      )}
                    </MessageContent>
                    <MessageMeta
                      message={message}
                      onRewind={
                        message.role === "user" &&
                        !message.id.startsWith("user-") &&
                        !message.id.startsWith("assistant-")
                          ? () => rewindMessage(message.id, message.content)
                          : undefined
                      }
                      onFork={
                        !message.id.startsWith("user-") &&
                        !message.id.startsWith("assistant-")
                          ? () => void forkMessage(index)
                          : undefined
                      }
                      onEdit={
                        message.role === "user" &&
                        !message.id.startsWith("user-") &&
                        !message.id.startsWith("assistant-")
                          ? () => {
                              setEditingMessageId(message.id);
                              setEditDraft(message.content);
                            }
                          : undefined
                      }
                    />
                  </Message>
                ),
              )}
              {(() => {
                // Plan mode: offer to approve the latest plan and start building.
                const last = messages[messages.length - 1];
                if (
                  mode !== "plan" ||
                  isCurrentSending ||
                  !last ||
                  last.role !== "assistant" ||
                  !last.content?.trim()
                ) {
                  return null;
                }
                const approve = (next: KodeAgentMode) => {
                  setMode(next);
                  void submitPrompt(
                    "Approved. Implement the plan above.",
                    selectedModelId,
                    undefined,
                    undefined,
                    next,
                  );
                };
                return (
                  <div className="kontinue-3d flex flex-wrap items-center gap-2 rounded-[20px] px-4 py-3">
                    <ClipboardList
                      size={14}
                      className="shrink-0 text-purple-500"
                    />
                    <p className="min-w-0 flex-1 text-[12.5px] text-foreground/85">
                      Ready to build this plan?
                    </p>
                    <button
                      type="button"
                      onClick={() => approve("supervised")}
                      className="kontinue-3d h-8 cursor-pointer rounded-full px-3.5 text-[12px] text-foreground/85 hover:text-foreground"
                    >
                      Approve, review each edit
                    </button>
                    <button
                      type="button"
                      onClick={() => approve("auto_edits")}
                      className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-3.5 text-[12px] font-medium"
                    >
                      Approve &amp; build
                    </button>
                  </div>
                );
              })()}
            </ConversationContent>
            <KodeTurnNavigator turns={userTurns} />
            <ConversationScrollButton container={jumpSlot} />
          </Conversation>
        )}

        <div
          className={
            inChat
              ? "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-6 pb-4"
              : "mx-auto w-full max-w-3xl"
          }
        >
          <div
            className={
              inChat
                ? "pointer-events-auto relative mx-auto w-full max-w-3xl"
                : undefined
            }
          >
          {inChat ? (
            <div
              ref={setJumpSlot}
              className="pointer-events-none absolute inset-x-0 bottom-full z-40 mb-3 flex justify-center"
            />
          ) : null}
          <ChatInput
            compact={inChat}
            trailing={
              inChat ? (
                <Context
                  maxTokens={contextWindow}
                  modelId={selectedModelId}
                  usage={latestUsage}
                  usedTokens={usedTokens}
                  openDelay={120}
                  closeDelay={250}
                >
                  <ContextTrigger className="h-6 gap-1 rounded-md px-1 text-[11px] text-foreground/55 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06] [&_svg]:size-3" />
                  <ContextContent
                    align="end"
                    side="top"
                    sideOffset={8}
                    className="liquid-glass-dropdown w-80 divide-y divide-black/[0.05] p-0 text-foreground dark:divide-white/[0.06]"
                  >
                    <ContextContentHeader className="space-y-2 px-4 py-3.5">
                      <ChatContextSummary
                        used={usedTokens}
                        max={contextWindow}
                      />
                    </ContextContentHeader>
                    <PlanUsageLimits
                      className="px-4 py-3.5"
                      onSeeAll={() => openSettings("usage")}
                    />
                  </ContextContent>
                </Context>
              ) : undefined
            }
            bottomBar={
              !inChat && activeProject ? (
                <KodeComposerBar
                  project={activeProject}
                  end={
                    <Context
                      maxTokens={contextWindow}
                      modelId={selectedModelId}
                      usage={latestUsage}
                      usedTokens={usedTokens}
                      openDelay={120}
                      closeDelay={250}
                    >
                      <ContextTrigger className="h-6 gap-1 rounded-md px-1 text-[11px] text-foreground/55 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06] [&_svg]:size-3" />
                      <ContextContent
                        align="end"
                        side="top"
                        sideOffset={8}
                        className="liquid-glass-dropdown w-80 divide-y divide-black/[0.05] p-0 text-foreground dark:divide-white/[0.06]"
                      >
                        <ContextContentHeader className="space-y-2 px-4 py-3.5">
                          <ChatContextSummary
                            used={usedTokens}
                            max={contextWindow}
                          />
                        </ContextContentHeader>
                        <PlanUsageLimits
                          className="px-4 py-3.5"
                          onSeeAll={() => openSettings("usage")}
                        />
                      </ContextContent>
                    </Context>
                  }
                />
              ) : undefined
            }
            loading={isCurrentSending}
            onStop={stopCurrentRun}
            models={kodeModels}
            modelId={selectedModelId}
            onModelChange={setSelectedModelId}
            onSend={(text, mId, atts, _w, r) =>
              submitPrompt(text, mId, atts, r)
            }
            mode={mode}
            onModeChange={setMode}
            seedText={seed.text}
            seedNonce={seed.nonce}
            placeholder={
              isCurrentSending
                ? "Kode is responding..."
                : inChat
                  ? "Ask a follow-up…"
                  : "Ask the agent to work on your app..."
            }
            planTier={planTier}
            reasoningEnabled={reasoningEnabled}
            onReasoningToggle={setReasoningEnabled}
          />

          {showSummary && compactionByChat.current.get(currentKey) ? (
            <div className="mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase text-foreground/45">
                  Compacted context summary
                </span>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="text-[11px] text-foreground/40 hover:text-foreground/70"
                >
                  Close
                </button>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[12px] text-foreground/65">
                {compactionByChat.current.get(currentKey)?.summary}
              </pre>
            </div>
          ) : null}

          {selectedCli || isCompacting || compactedChats[currentKey] ? (
            <div className="mt-2 flex items-center justify-end gap-2">
              {selectedCli ? (
                <span
                  className="mr-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400"
                  title="Runs the CLI installed on this computer with your own sign-in. Not counted in Kode usage."
                >
                  {cliNeedsLogin(cliStatuses, selectedCli.id)
                    ? `${selectedCli.label} is not signed in. Sign in from Settings → Providers`
                    : `${selectedCli.label} · ${cliPlanLabel(selectedCli).replace("Uses", "uses")} · not counted in Kode usage`}
                </span>
              ) : null}
              {isCompacting ? (
                <span className="mr-auto flex items-center gap-1.5 text-[11px] text-foreground/45">
                  <Loader2 className="size-3 animate-spin" />
                  <Shimmer>Compacting context…</Shimmer>
                </span>
              ) : null}
              {compactedChats[currentKey] ? (
                <button
                  type="button"
                  onClick={() => setShowSummary((v) => !v)}
                  className="text-[11px] text-foreground/40 underline-offset-2 hover:text-foreground/70 hover:underline"
                  title="Older messages were summarized to fit the model's context window. Click to view."
                >
                  context compacted · view summary
                </button>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>

        {!inChat ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full pt-4 text-left">
            {KODE_STARTER_PROMPTS.map((starter) => (
              <button
                key={starter.title}
                type="button"
                onClick={() => submitPrompt(starter.prompt)}
                className="liquid-glass-card group flex items-start gap-3 rounded-[22px] p-3.5 text-left cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/20 text-base shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] group-hover:scale-105 transition-transform">
                  {starter.icon}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                      {starter.title}
                    </p>
                    <ArrowUpRight
                      size={12}
                      className="text-purple-500/40 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                    />
                  </div>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 leading-relaxed group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
                    {starter.prompt}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// Turn navigator for the Kode chat. Lives inside <Conversation> so it can
// stop the stick-to-bottom behavior before jumping to an older message.
function KodeTurnNavigator({ turns }: { turns: ChatTurn[] }) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  const { showTurnNavigator } = useAppSettings();
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  if (!showTurnNavigator) return null;
  return (
    <DesktopChatTurnNavigator
      turns={turns}
      getScrollElement={getScrollElement}
      onJumpToTurn={(turnId) => {
        const root = scrollRef.current;
        const message = document.getElementById(turnId);
        if (!root || !message) return;
        stopScroll();
        // scrollIntoView also scrolls overflow:hidden ancestors, which slides
        // the whole pane. Only the conversation itself should move.
        let node = message.parentElement;
        while (node && node !== document.body) {
          if (node !== root) {
            const overflow = getComputedStyle(node).overflowY;
            if (
              (overflow === "hidden" || overflow === "clip") &&
              node.scrollTop !== 0
            ) {
              node.scrollTop = 0;
            }
          }
          node = node.parentElement;
        }
        const top =
          root.scrollTop +
          (message.getBoundingClientRect().top -
            root.getBoundingClientRect().top) -
          72;
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        root.scrollTo({
          top: Math.min(Math.max(0, top), max),
          behavior: "smooth",
        });
      }}
    />
  );
}

function ChatContextSummary({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
  return (
    <>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-foreground/90">Context · this chat</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {compact.format(used)} / {compact.format(max)}
          <span className="ml-2 font-sans tabular-nums text-foreground/75">
            {pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%
          </span>
        </span>
      </div>
      <UsageBar pct={pct} />
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        Older messages are summarized automatically when the chat gets close to
        the limit.
      </p>
    </>
  );
}

export default PlanView;
