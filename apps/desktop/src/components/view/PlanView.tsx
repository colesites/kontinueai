import { useUser } from "@clerk/clerk-react";
import {
  canUseKodeModel,
  KODE_DEFAULT_MODEL_ID,
  KODE_MODELS,
  type KodePlan,
} from "@repo/ai/lib/kode";
import { useConvex, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ClipboardList,
  Copy,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
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
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { CollapsibleUserText } from "@/components/chat/CollapsibleUserText";
import {
  type ChatTurn,
  DesktopChatTurnNavigator,
} from "@/components/chat/DesktopChatTurnNavigator";
import { ForkIcon } from "@/components/chat/ForkIcon";
import { TodoSummary } from "@/components/chat/TodoList";
import { TodoDock } from "@/components/chat/TodoDock";
import { CHAT_APPROVABLE_TOOLS, KodeComposerPrompt } from "@/components/chat/KodeComposerPrompt";
import { CommandBlock, ToolStepList } from "@/components/chat/ToolStep";
import { KodeComposerBar } from "@/components/kode/KodeComposerBar";
import KodeSessionImport from "@/components/kode/KodeSessionImport";
import { PlanUsageLimits, UsageBar } from "@/components/usage/KodeUsageCard";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { getSettings, useAppSettings, type ProviderInstance } from "@/lib/app-settings";
import { getScopedSettings, loadProjectSettings, useScopedSettings } from "@/lib/kode-scoped-settings";
import { api } from "@/lib/convex-api";
import { type KodeToolStep, runKodeAgent } from "@/lib/kode-agent";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import { expandSlashPrompt, resolveSlash } from "@/lib/kode-commands";
import { pickTriageModel, triagePrompt, triageReport } from "@/lib/kode-triage";
import { accountGroups, accountKey, activeAccountId, modelOnAccount, nativeSessionBelongsTo, resolveSwitchTarget, setActiveAccount } from "@/lib/kode-accounts";
import { homeDir } from "@tauri-apps/api/path";
import { useSkills } from "@/hooks/use-skills";
import { getActiveSkills, setActiveSkills } from "@/lib/kode-skills";
import { discoverMcpTools, loadMcpConfigs, useMcpVersion } from "@/lib/kode-mcp";
import { pluginMcpConfigs, usePlugins } from "@/lib/kode-plugins";
import { loadConnectorTools } from "@/lib/kode-connectors";
import { buildPluginAgentTool } from "@/lib/kode-plugin-agents";
import { hasHooks, runHooks } from "@/lib/kode-hooks";
import type { KodeExtraTool } from "@/lib/kode-agent";
import type { KodeContentPart, KodeToolDefinition } from "@/lib/kode-chat";
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
  getProviders,
  updateProvider,
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
import { getImportContext, nativeContinueOf, readCodingSession, saveImportContext } from "@/lib/kode-import";
import { invoke } from "@tauri-apps/api/core";
import { resolveConflict, setChatBusy, syncImportContext } from "@/lib/kode-import-sync";
import { ImportedChatBar, useImportContext, useImportSyncDeps } from "@/components/kode/ImportedChatBar";
import { IncomingProjectMoves } from "@/components/kode/ProjectMove";
import { NoProjectBar } from "@/components/kode/NoProjectBar";
import { PrStatusBar, useVisiblePrUrls } from "@/components/kode/PrStatusBar";
import { isWebhookEvent, WebhookEventCard } from "@/components/kode/WebhookEventCard";
import { CodeRunContext } from "@/components/ai-elements/code-run-context";
import { envVarsFor } from "@/lib/kode-environments";
import type { KodeAgentMode, KodeTodo } from "@/lib/kode-tools";
import {
  type KodeWorkspaceMessage,
  useKodeWorkspace,
} from "@/lib/kode-workspace";
import { useReasoningPreference } from "@/lib/use-reasoning-preference";
import { LimitCard, ScheduledBar } from "@/components/kode/ScheduledPrompts";
import { mergeQueued, QueuedMessages, type QueuedMessage } from "@/components/chat/QueuedMessages";
import { cleanLimitMarker, detectLimit, type LimitHit } from "@/lib/kode-limits";
import { buildHandoff, describeHandoff } from "@/lib/kode-handoff";
import { redactSecrets, scanSecrets, scrubHistory } from "@/lib/kode-secrets";
import { condenseSteps, withSteps } from "@/lib/kode-steps";
import { setDenialNote } from "@/lib/kode-agent";
import { HandoffChip, HandoffPreviewDialog } from "@/components/kode/HandoffPreview";
import { clearInterruptedTurn, getInterruptedTurn, interruptedTurnNote, ledgerFromSteps, recordInterruptedTurn } from "@/lib/kode-tool-ledger";
import { gitStatus } from "@/components/panel/panel-api";
import { recordPrLinks } from "@/lib/kode-prs";
import { rememberChatModel } from "@/lib/kode-pr-watch";
import { buildSubagentTool } from "@/lib/kode-fanout";
import {
  annotationTitle,
  formatAnnotations,
  takeAnnotations,
  type KodeAnnotation,
} from "@/lib/kode-annotations";
import {
  saveAttachmentsToProject,
  savedAttachmentsNote,
} from "@/lib/kode-attachments";
import {
  getScheduledPrompts,
  idleFor,
  removeScheduledPrompt,
  schedulePrompt,
  useScheduledPrompts,
  type ScheduledPrompt,
} from "@/lib/kode-schedule";

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
  // Plan/todos — now persisted in Convex message metadata.
  toolTodos?: KodeTodo[];
  // Imported retry/limit events render as system notices, not chat bubbles.
  notice?: boolean;
  // The turn stopped on a usage limit: what to resend, and when it resets.
  limit?: {
    resetAt: number | null;
    text: string;
    modelId: string;
    mode: KodeAgentMode;
    attachments?: StagedAttachment[];
  };
};

/** A turn that stopped on a usage limit (see src/lib/kode-limits.ts). */
class KodeLimitError extends Error {
  constructor(readonly limit: LimitHit) {
    super(limit.message);
  }
}

/** Switch to a chat with a due scheduled prompt only after this much idle time. */
const SCHEDULE_IDLE_MS = 2 * 60_000;

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
      className={`flex items-start justify-center gap-2 py-1 text-center text-[12px] leading-snug ${warning ? "text-amber-600 dark:text-amber-400/90" : "text-foreground/60"}`}
    >
      <span className="mt-2 h-px w-8 shrink-0 bg-black/10 dark:bg-white/10" />
      {warning ? (
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      ) : (
        <Info size={12} className="mt-0.5 shrink-0" />
      )}
      {/* Notices wrap: they often say what to do next. */}
      <span className="max-w-lg text-left">{normalized}</span>
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
      // Another account of the same provider became active: keep the model.
      const current = parseCliModelId(selectedModelId);
      const instance = current ? getProvider(current.instanceId, appSettings) : undefined;
      const activeId = instance ? activeAccountId(accountKey(instance), appSettings.kodeProviders, appSettings.kodeActiveAccounts) : null;
      const moved = activeId ? modelOnAccount(selectedModelId, activeId) : null;
      setSelectedModelId(moved && kodeModels.some((m) => m.id === moved) ? moved : KODE_DEFAULT_MODEL_ID);
    }
  }, [cliStatuses, kodeModels, selectedModelId, appSettings]);

  const homeDirRef = useRef("");
  useEffect(() => {
    void homeDir().then((dir) => (homeDirRef.current = dir.replace(/\/+$/, ""))).catch(() => {});
  }, []);

  // `/switch [account]`: move this chat to another account of the same
  // provider (no name = the next one). Handled here, never sent to a model.
  const switchAccount = (query: string) => {
    const key = activeChatId ?? DRAFT_KEY;
    const say = (content: string) =>
      setPendingByChat((current) => ({
        ...current,
        [key]: [...(current[key] ?? []), { id: `notice-${Date.now()}`, role: "assistant", content, modelId: selectedModelId, createdAt: Date.now(), status: "complete", notice: true }],
      }));
    const groups = accountGroups(appSettings);
    const current = parseCliModelId(selectedModelId);
    const currentInstance = current ? getProvider(current.instanceId, appSettings) : undefined;
    const group =
      (currentInstance && groups.find((g) => g.key === accountKey(currentInstance))) ??
      groups.find((g) => resolveSwitchTarget(g, g.activeId, query) && query.trim());
    if (!group) {
      say(
        groups.length === 0
          ? "There is only one account per provider. Add another in Settings → Providers → Accounts, then use /switch."
          : `Pick a model from ${groups.map((g) => getProvider(g.accounts[0].id, appSettings)?.label ?? g.key).join(" or ")} first, or name the account: /switch-<account>.`,
      );
      return;
    }
    const target = resolveSwitchTarget(group, currentInstance?.id ?? group.activeId, query);
    if (!target) {
      say(`No account matches "${query}". Accounts: ${group.accounts.filter((a) => a.enabled).map((a) => a.label).join(", ")}.`);
      return;
    }
    setActiveAccount(target);
    const model = current ? modelOnAccount(selectedModelId, target.id) : null;
    if (model) setSelectedModelId(model);
    say(`Switched to ${target.label}. The next message runs on that account${current ? "" : " once you pick one of its models"}.`);
  };
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
    selectChat,
    rewindAfter,
    ensureFolder,
    activeTab,
    newChat,
    assignChatsToFolder,
  } = useKodeWorkspace();

  // Resolve the on-disk root of the active chat's (or draft's) project, if any.
  const activeProjectId =
    (activeChatId
      ? chats.find((chat) => chat.id === activeChatId)?.projectId
      : draftProjectId) ?? null;
  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? null;

  // Continuation context for imported coding sessions. Kept in localStorage
  // (per chat), kept current by the background sync, and appended to the
  // agent's system context so the captured project state grounds later turns.
  const importContext = useImportContext(activeChatId, chats, projects);
  const hasPrBar = useVisiblePrUrls(activeChatId).length > 0;
  // A chat imported to continue its own Claude Code / Codex session starts on
  // that account's CLI (once; you can switch models after).
  useEffect(() => {
    if (!importContext || nativeContinueOf(importContext) === "off") return;
    const flag = `kode.native-model-set.${importContext.chatId}`;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {
      return;
    }
    const owns = (modelId: string) => {
      const cli = parseCliModelId(modelId);
      const instance = cli ? getProvider(cli.instanceId, appSettings) : undefined;
      return !!instance && nativeSessionBelongsTo(importContext.provider, importContext.sourcePath, instance, homeDirRef.current);
    };
    if (owns(selectedModelId)) return;
    const match = kodeModels.find((m) => owns(m.id));
    if (!match) return;
    setSelectedModelId(match.id);
    try {
      localStorage.setItem(flag, "1");
    } catch {
      // Not remembered: it picks the CLI again next time.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importContext?.chatId, kodeModels]);
  const importSyncDeps = useImportSyncDeps();
  const [syncingImport, setSyncingImport] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  useEffect(() => {
    setSyncError(null);
  }, [activeChatId]);

  const syncImportedSession = async (options?: { silent?: boolean }) => {
    // Read fresh: the background sync may have moved the context on.
    const current = activeChatId ? getImportContext(activeChatId) : null;
    if (!current) return;
    if (!current.sourcePath) {
      if (!options?.silent) setSyncError("This import has no local transcript to sync from.");
      return;
    }
    setSyncingImport(true);
    if (!options?.silent) setSyncError(null);
    try {
      await syncImportContext(current, importSyncDeps);
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not sync the imported session.");
    } finally {
      setSyncingImport(false);
    }
  };

  // Fall back to the imported session's captured project root so tools still
  // work in the first render, before the Convex chat → folder mapping arrives.
  const projectRoot =
    activeProject?.path ??
    (activeChatId ? (importContext?.projectPath ?? null) : null);

  // Settings → project (.kode/settings.json) → environment overrides.
  const scopedSettings = useScopedSettings(projectRoot);
  // A new session in a project starts from that project's defaults.
  useEffect(() => {
    if (activeChatId || !projectRoot) return;
    void loadProjectSettings(projectRoot).then(() => {
      const scoped = getScopedSettings(projectRoot);
      if (scoped.defaultKodeModel && KODE_MODELS.some((m) => m.id === scoped.defaultKodeModel)) {
        setSelectedModelId(scoped.defaultKodeModel);
      }
      if (scoped.defaultKodeMode && scoped.defaultKodeMode !== "design") setMode(scoped.defaultKodeMode);
    });
  }, [projectRoot, activeChatId]);

  // Installed skills, for the slash picker and explicit `/skill` invocation.
  // Kept fresh (focus + interval) so new skills appear without a restart.
  const { skills } = useSkills(projectRoot);

  // MCP tools from enabled servers: ones you added plus ones plugins provide.
  const [mcpTools, setMcpTools] = useState<KodeToolDefinition[]>([]);
  const plugins = usePlugins();
  const mcpVersion = useMcpVersion();
  useEffect(() => {
    let cancelled = false;
    discoverMcpTools([...loadMcpConfigs(), ...pluginMcpConfigs(plugins)])
      .then(({ definitions }) => {
        if (!cancelled) setMcpTools(definitions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [plugins, mcpVersion]);

  // Connected web apps (GitHub, Gmail, …) as tools; refreshed when the window
  // regains focus, so an app connected in the browser shows up.
  const [connectorTools, setConnectorTools] = useState<KodeExtraTool[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void loadConnectorTools().then((tools) => {
        if (!cancelled) setConnectorTools(tools);
      });
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  const resolveApproval = runtime.resolveApproval;
  // Chats where "Allow edits in this chat" was chosen.
  const autoEditChats = useRef(new Set<string>());
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
      return [{ role: message.role, content: condenseSteps(message.content) }];
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
          | { model?: string; todos?: KodeTodo[] }
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
        };
      }),
    [convexMessages, selectedModelId],
  );

  const currentKey = activeChatId ?? DRAFT_KEY;

  // ---- Messages typed while Kode is working (sent when the turn ends) ----
  const [queuedByChat, setQueuedByChat] = useState<Record<string, QueuedMessage[]>>({});
  const queued = queuedByChat[currentKey] ?? [];
  const enqueue = (item: Omit<QueuedMessage, "id">) =>
    setQueuedByChat((current) => ({
      ...current,
      [currentKey]: [...(current[currentKey] ?? []), { ...item, id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    }));
  const removeQueued = (id: string) =>
    setQueuedByChat((current) => ({ ...current, [currentKey]: (current[currentKey] ?? []).filter((item) => item.id !== id) }));
  // A new chat starts as a draft and gets its id mid-run: its queue follows.
  const lastKeyRef = useRef(currentKey);
  useEffect(() => {
    const previous = lastKeyRef.current;
    lastKeyRef.current = currentKey;
    if (previous !== DRAFT_KEY || currentKey === DRAFT_KEY) return;
    setQueuedByChat((current) => {
      const draft = current[DRAFT_KEY];
      if (!draft?.length || current[currentKey]?.length) return current;
      const { [DRAFT_KEY]: _moved, ...rest } = current;
      return { ...rest, [currentKey]: draft };
    });
  }, [currentKey]);
  const overlay = pendingByChat[currentKey] ?? EMPTY_CHAT_MESSAGES;
  const messages = useMemo(
    () => [...persistedMessages, ...overlay],
    [persistedMessages, overlay],
  );
  const isCurrentSending = !!sendingChats[currentKey];
  const isCompacting = !!compactingChats[currentKey];
  const latestUsage = usageByChat[currentKey];
  const messagesLoading = activeChatId !== null && convexMessages === undefined;

  // Imported chats sync in the background (useImportBackgroundSync in
  // KodeView), including this one; the bar's Sync button forces a read.
  useEffect(() => {
    for (const [chatId, busy] of Object.entries(sendingChats)) setChatBusy(chatId, busy);
  }, [sendingChats]);

  // The hand-off a model gets when it joins this chat with no session of its
  // own (a CLI model, or another account): task, recent turns, plan, project
  // state, any unfinished tool calls. Secrets are scrubbed. The composer's
  // "Preview hand-off" shows exactly this text.
  const composeHandoff = async (
    modelId: string,
    historyOverride?: { role: "user" | "assistant"; content: string }[],
    // The send path adds the unfinished-turn note to the new message itself.
    withInterrupted = false,
  ) => {
    const earlier = persistedMessages.filter((m) => !m.notice && m.content.trim());
    if (earlier.length === 0 && !importContext?.contextPrompt) return null;
    const lastAssistant = [...earlier].reverse().find((m) => m.role === "assistant");
    const fromModel =
      lastAssistant?.modelId && lastAssistant.modelId !== modelId ? getModelName(lastAssistant.modelId) : null;
    const todos = [...earlier].reverse().find((m) => m.toolTodos?.length)?.toolTodos;
    const git = projectRoot ? await gitStatus(projectRoot).catch(() => null) : null;
    const interrupted = withInterrupted ? getInterruptedTurn(activeChatId) : null;
    const raw = buildHandoff({
      history: (historyOverride ?? earlier).map((m) => ({
        role: m.role,
        content: condenseSteps(m.content),
        modelName: "modelId" in m && m.modelId ? getModelName(m.modelId as string) : null,
      })),
      fromModel,
      todos,
      branch: git?.isRepo ? git.branch : null,
      changedFiles: git?.isRepo ? git.files : [],
      importContext: importContext?.contextPrompt,
      interrupted: interrupted ? interruptedTurnNote(interrupted) : null,
    });
    const kinds = scanSecrets(raw.text).map((m) => m.kind);
    const scrubbed = redactSecrets(raw.text);
    return { handoff: { ...raw, text: scrubbed.text }, redactions: scrubbed.count, kinds, fromModel };
  };

  // ▶ Run on suggested shell commands runs in this chat's project folder.
  const codeRunTarget = useMemo(
    () => (projectRoot ? { root: projectRoot, env: envVarsFor(projectRoot) } : null),
    [projectRoot],
  );

  // A question or approval waiting above the input (the plan dock shrinks).
  const promptWaiting = messages.some((message) =>
    (message.toolSteps ?? []).some((step) => step.state === "pending-options" || step.state === "pending-approval"),
  );
  // Height of everything docked at the bottom (plan, prompts, input), so the
  // conversation can scroll its last lines clear of it.
  const [bottomDockHeight, setBottomDockHeight] = useState(0);
  const bottomDockObserver = useRef<ResizeObserver | null>(null);
  const bottomDockRef = useCallback((node: HTMLDivElement | null) => {
    bottomDockObserver.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(() => setBottomDockHeight(node.offsetHeight));
    observer.observe(node);
    bottomDockObserver.current = observer;
  }, []);

  // The newest plan in this chat, docked above the input.
  const dockPlan = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const todos = messages[index].toolTodos;
      if (todos?.length) return { todos, key: messages[index].id };
    }
    return null;
  }, [messages]);

  // Show "Preview hand-off" when the next send starts the selected CLI model
  // fresh in a chat that already has turns.
  const [handoffOpen, setHandoffOpen] = useState(false);
  const handoffTarget = (() => {
    const cli = parseCliModelId(selectedModelId);
    if (!cli || !activeChatId || isCurrentSending) return null;
    if (!persistedMessages.some((m) => !m.notice && m.content.trim())) return null;
    if (getCliSession(activeChatId, cli.instanceId)) return null;
    const instance = getProvider(cli.instanceId, appSettings);
    // An imported Claude Code / Codex chat can resume its own session: nothing is handed off.
    if (instance && importContext && nativeContinueOf(importContext) !== "off" && nativeSessionBelongsTo(importContext.provider, importContext.sourcePath, instance, homeDirRef.current)) return null;
    return getModelName(selectedModelId) ?? selectedModelId;
  })();
  const loadHandoffPreview = useCallback(async () => {
    const composed = await composeHandoff(selectedModelId, undefined, true);
    if (!composed) return null;
    return {
      text: composed.handoff.text,
      redactions: composed.redactions,
      kinds: composed.kinds,
      includedMessages: composed.handoff.includedMessages,
      omittedMessages: composed.handoff.omittedMessages,
      files: composed.handoff.files,
      fromModel: composed.fromModel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId, activeChatId, persistedMessages, importContext?.contextPrompt, projectRoot]);

  const submitPrompt = async (
    text: string,
    modelId = selectedModelId,
    attachments?: StagedAttachment[],
    sendReasoningEnabled?: boolean,
    modeOverride?: KodeAgentMode,
    historyOverride?: { role: "user" | "assistant"; content: string }[],
    annotations: KodeAnnotation[] = [],
  ) => {
    // Approving a plan switches mode and sends in the same tick, so use the
    // override instead of the (not yet updated) state.
    const activeMode = modeOverride ?? mode;
    const key = activeChatId ?? DRAFT_KEY;
    if (sendingChats[key]) return;
    const slash = resolveSlash(text);
    // `/triage [problem]`: diagnostics handed to Claude Code or Codex.
    if (slash?.name === "triage") {
      let triageModel = pickTriageModel(selectedModelId, kodeModels, (id) => getProvider(id, appSettings)?.kind);
      if (!triageModel) {
        // Claude Code / Codex installed and signed in but switched off: turn
        // it on for this rather than sending you to Settings.
        const ready = getProviders(appSettings).find(
          (p) =>
            (p.kind === "claude" || p.kind === "codex") &&
            !p.enabled &&
            cliStatuses?.some((s) => s.instance === p.id && s.installed && s.loggedIn !== false),
        );
        if (ready) {
          updateProvider(ready.id, { enabled: true });
          const fresh = cliPickerModels(getSettings(), cliStore);
          triageModel = pickTriageModel(selectedModelId, fresh, (id) => getProvider(id)?.kind);
          if (triageModel) {
            setPendingByChat((current) => ({
              ...current,
              [key]: [...(current[key] ?? []), { id: `notice-${Date.now()}`, role: "assistant", content: `Turned on ${ready.label} in Settings → Providers to run triage.`, modelId: selectedModelId, createdAt: Date.now(), status: "complete", notice: true }],
            }));
          }
        }
      }
      if (!triageModel) {
        setPendingByChat((current) => ({
          ...current,
          [key]: [...(current[key] ?? []), { id: `notice-${Date.now()}`, role: "assistant", content: "Triage runs on Claude Code or Codex. Turn one on in Settings → Providers and sign in, then try /triage again.", modelId: selectedModelId, createdAt: Date.now(), status: "complete", notice: true }],
        }));
        return;
      }
      const report = await triageReport(projectRoot).catch(() => "## Diagnostics\nCould not collect diagnostics.");
      setSelectedModelId(triageModel);
      return submitPrompt(triagePrompt(slash.rest, report), triageModel, attachments, sendReasoningEnabled, modeOverride, historyOverride, annotations);
    }
    // `/switch` = next account, `/switch-<account>` = that account.
    if (slash && (slash.name === "switch" || slash.name.startsWith("switch-"))) {
      switchAccount(slash.name === "switch" ? slash.rest : slash.name.slice("switch-".length));
      return;
    }

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
    // Expand a leading `/command` or `/skill` into the model's prompt; the bubble
    // still shows what the user typed.
    const expandedText = expandSlashPrompt(text, skills);
    // Attachments are also saved into the project (.kode/attachments) so CLI
    // agents can open images by path and any agent can reuse the files.
    const savedFiles =
      projectRoot && attachments?.length
        ? await saveAttachmentsToProject(projectRoot, attachments)
        : [];
    // The last turn stopped mid-way: tell this turn what its tools really did.
    const interruptedTurn = getInterruptedTurn(activeChatId);
    const interruptedPrefix = interruptedTurn ? `${interruptedTurnNote(interruptedTurn)}\n\n---\n\n` : "";
    const modelText = `${interruptedPrefix}${expandedText}${fileBlocks}${savedAttachmentsNote(savedFiles)}${formatAnnotations(annotations)}`;
    // Steps of this turn, kept for the ledger if the turn doesn't finish.
    const turnSteps = new Map<string, KodeToolStep>();
    const noteLine = annotations.length
      ? `\n\n[${annotations.length} annotation${annotations.length === 1 ? "" : "s"}: ${annotations
          .map((a) => a.note.trim() || annotationTitle(a))
          .join("; ")}]`
      : "";
    // Images saved in the project show in the bubble (and open full size).
    const imageBlocks = savedFiles
      .filter((file) => file.mediaType.startsWith("image/"))
      .map((file) => `\n\n\`\`\`kode-image\n${JSON.stringify({ path: file.path, mediaType: file.mediaType, root: projectRoot })}\n\`\`\``)
      .join("");
    const displayText = `${
      attachments?.length
        ? `${text}\n\n[Attached: ${attachments.map((a) => a.filename ?? "file").join(", ")}]`
        : text
    }${noteLine}${imageBlocks}`;
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
          items.push({ role: message.role, content: condenseSteps(message.content) });
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
        turnSteps.set(step.id, step);
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
        // An imported Codex chat continues in its original Codex thread when
        // this account owns it: the thread keeps its own history, no hand-off.
        const nativeMode = nativeContinueOf(importContext);
        const importedThread =
          importContext &&
          nativeMode !== "off" &&
          nativeSessionBelongsTo(importContext.provider, importContext.sourcePath, cliProvider, homeDirRef.current)
            ? importContext.sessionId
            : null;
        const storedSession = getCliSession(cliChatId, cliProvider.id);
        const sessionId = storedSession ?? importedThread;
        // "Fork": the first turn branches a new session; later turns continue that one.
        const forkSession = !storedSession && !!importedThread && nativeMode === "fork";
        // Claude Code finds a session by the folder it ran in.
        const cliRoot =
          importedThread && cliProvider.kind === "claude" && importContext?.sessionCwd && importContext.sessionCwd !== projectRoot &&
          (await invoke<boolean>("kode_path_exists", { path: importContext.sessionCwd }).catch(() => false))
            ? importContext.sessionCwd
            : projectRoot;
        // A fresh CLI session in an existing chat gets a hand-off: the task,
        // recent turns, the plan and what changed in the project.
        let prompt = modelText;
        if (!sessionId) {
          const earlier = persistedMessages.filter(
            (m) => !m.notice && m.content.trim(),
          );
          const composed = await composeHandoff(modelId, historyOverride);
          if (composed) {
            const { handoff, fromModel } = composed;
            prompt = `${handoff.text}\n\n---\n\n## New message\n${modelText}`;
            if (earlier.length > 0) {
              applyDelta(
                "content",
                `_${describeHandoff(handoff, fromModel)}_\n\n`,
              );
            }
          }
        }
        const unsavedImages = imageAtts.filter(
          (a) => !savedFiles.some((f) => f.filename === (a.filename || "attachment")),
        );
        if (unsavedImages.length > 0) {
          applyDelta(
            "content",
            "_Images couldn't be saved to the project, so the CLI only gets the text._\n\n",
          );
        }

        const steps = new Map<string, KodeToolStep>();
        const notices: string[] = [];
        const result = await runCliTurn({
          instance: cliProvider,
          root: cliRoot,
          prompt,
          sessionId,
          fork: forkSession,
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
        // The turn just went into the source thread too. Move the import's
        // sync point past it so background sync doesn't add it a second time.
        if (importContext && result.sessionId && result.sessionId === importContext.sessionId && importContext.sourcePath) {
          const anchored = getImportContext(chatId);
          if (anchored) {
            // Awaited, so the chat stays "busy" and background sync waits.
            await readCodingSession(anchored.provider as never, anchored.sourcePath!)
              .then((session) =>
                saveImportContext(
                  resolveConflict(anchored, "reanchor", {
                    session,
                    chatMessageCount: (anchored.chatMessageCount ?? anchored.syncedMessageCount ?? anchored.messageCount) + 2,
                  }),
                ),
              )
              .catch(() => {});
          }
        }
        if (result.error) {
          const limit = detectLimit(result.error, {
            resetAt: result.limitResetsAt,
          });
          if (limit) throw new KodeLimitError(limit);
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
          content: withSteps(content, [...turnSteps.values()]),
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
        getScopedSettings(projectRoot).kodeContextWindow,
      );
      // Switching to this model mid-chat is a hand-off: the history may hold
      // secrets (say, a token in a pasted terminal log) the new model never
      // needs. Remove them, like CLI hand-offs do.
      const lastAssistantModel = [...persistedMessages].reverse().find((m) => m.role === "assistant" && !m.notice)?.modelId;
      const handingOver = Boolean(lastAssistantModel && lastAssistantModel !== modelId);
      const scrubbed = handingOver ? scrubHistory(history) : { history, count: 0 };
      if (scrubbed.count > 0) {
        applyDelta(
          "content",
          `_Removed ${scrubbed.count} secret${scrubbed.count === 1 ? "" : "s"} from the chat history before handing it to ${getModelName(modelId) ?? "this model"}._\n\n`,
        );
      }
      const handoffHistory = scrubbed.history;
      if (needsCompaction(handoffHistory, window)) {
        setCompactingChats((current) => ({ ...current, [runKey]: true }));
      }
      const { messages: sentHistory, compacted } = await compactHistory(
        handoffHistory,
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

      // Plugin hooks (only plugins you allowed): SessionStart on a chat's
      // first message, UserPromptSubmit on every message.
      const hookContext: string[] = [];
      if (projectRoot && chatId) {
        const hookPayload = { cwd: projectRoot, sessionId: chatId, prompt: modelText };
        if (history.length === 0 && hasHooks(plugins, "SessionStart")) {
          hookContext.push(...(await runHooks(plugins, "SessionStart", hookPayload)).context);
        }
        if (hasHooks(plugins, "UserPromptSubmit")) {
          const submitted = await runHooks(plugins, "UserPromptSubmit", hookPayload);
          if (submitted.blocked) throw new Error(`A plugin hook stopped this message: ${submitted.blocked}`);
          hookContext.push(...submitted.context);
        }
      }
      const hookSession = chatId ?? "";
      const pluginAgentTool = projectRoot
        ? buildPluginAgentTool({ plugins, root: projectRoot, modelId, mode: activeMode })
        : null;

      const response = await runKodeAgent({
        // Background tasks the agent starts are listed under this chat.
        chatId: runKey === DRAFT_KEY ? null : runKey,
        // Fast mode (Settings / model picker); the server re-checks the plan.
        fast: getScopedSettings(projectRoot).kodeFastMode,
        modelId,
        history: sentHistory,
        userText: modelText,
        userContent,
        mode: activeMode,
        projectRoot,
        extraSystemContext:
          [importContext?.contextPrompt, ...hookContext].filter(Boolean).join("\n\n") ||
          undefined,
        toolHooks:
          projectRoot && chatId
            ? {
                before: async (name, args) =>
                  hasHooks(plugins, "PreToolUse")
                    ? (
                        await runHooks(plugins, "PreToolUse", {
                          cwd: projectRoot,
                          sessionId: hookSession,
                          toolName: name,
                          toolInput: args,
                        })
                      ).blocked
                    : null,
                after: async (name, args, result) =>
                  hasHooks(plugins, "PostToolUse")
                    ? (
                        await runHooks(plugins, "PostToolUse", {
                          cwd: projectRoot,
                          sessionId: hookSession,
                          toolName: name,
                          toolInput: args,
                          toolResponse: result,
                        })
                      ).context
                    : [],
              }
            : undefined,
        activeSkills: chatId ? getActiveSkills(chatId) : [],
        mcpTools,
        // Connected apps, plus "use 3 sub-agents with …" → run_subagents.
        extraTools: projectRoot
          ? [
              ...connectorTools,
              ...(pluginAgentTool ? [pluginAgentTool] : []),
              buildSubagentTool({
                root: projectRoot,
                models: kodeModels
                  .filter(
                    (m) =>
                      parseCliModelId(m.id) || canUseKodeModel(m.id, planTier),
                  )
                  .map((m) => ({ id: m.id, name: m.name })),
                deps: {
                  ensureFolder,
                  createChatRecord,
                  addMessageRecord,
                  modelName: getModelName,
                },
              }),
            ]
          : [],
        reasoningEnabled: sendReasoningEnabled ?? reasoningEnabled,
        reasoningEffort: scopedSettings.kodeReasoning === "off" ? undefined : scopedSettings.kodeReasoning,
        onText: (delta) => applyDelta("content", delta),
        onReasoning: (delta) => applyDelta("reasoning", delta),
        onToolStep: upsertToolStep,
        requestApproval: (step) =>
          // "Allow edits in this chat" was clicked: don't ask again for edits.
          CHAT_APPROVABLE_TOOLS.has(step.name) && autoEditChats.current.has(runKey)
            ? Promise.resolve(true)
            : new Promise<boolean>((resolve) => {
                runtime.registerApproval(step.id, resolve);
              }),
        requestOptions: (step) =>
          new Promise<string[]>((resolve) => {
            runtime.registerOptions(step.id, resolve);
          }),
        onTodos: upsertTodos,
        signal: abortController.signal,
      });

      if (projectRoot && hookSession && hasHooks(plugins, "Stop")) {
        void runHooks(plugins, "Stop", { cwd: projectRoot, sessionId: hookSession });
      }

      if (chatId && response.loadedSkills.length > 0) {
        setActiveSkills(chatId, response.loadedSkills);
      }

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
        content: withSteps(response.content, [...turnSteps.values()]),
        model: modelId,
        // Whole-turn token cost (summed across all agent iterations) — meters the
        // user's general daily + weekly token budget.
        tokens: response.tokensConsumed,
        todos: latestTodos.length > 0 ? latestTodos : undefined,
      });

      const finishedId = chatId;
      setUsageByChat((current) => ({
        ...current,
        [finishedId]: response.usage,
      }));
      if (response.usage?.totalTokens)
        saveContextTokens(finishedId, response.usage.totalTokens);
      clearInterruptedTurn(runKey);
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
      const limit =
        error instanceof KodeLimitError ? error.limit : detectLimit(message);
      if (turnSteps.size > 0) {
        recordInterruptedTurn(runKey, {
          at: Date.now(),
          model: getModelName(modelId) ?? modelId,
          reason: limit ? "usage limit" : cleanLimitMarker(message).slice(0, 160),
          steps: ledgerFromSteps([...turnSteps.values()]),
        });
      }

      setPendingByChat((current) => ({
        ...current,
        [runKey]: (current[runKey] ?? []).map((item) =>
          item.role === "assistant"
            ? {
                ...item,
                content: cleanLimitMarker(message),
                status: "error",
                limit: limit
                  ? {
                      resetAt: limit.resetAt,
                      text,
                      modelId,
                      mode: activeMode,
                      attachments,
                    }
                  : undefined,
              }
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

  // Link PRs to the chat that opened them (their URL shows up in its messages).
  useEffect(() => {
    if (!activeChatId || persistedMessages.length === 0) return;
    const title = chats.find((chat) => chat.id === activeChatId)?.title;
    if (!title) return;
    const replies = persistedMessages.filter((m) => m.role === "assistant");
    recordPrLinks(
      activeChatId,
      title,
      replies.map((m) => m.content),
    );
    // Auto-fix prompts for this chat's PRs run on the model it last used.
    const lastModel = replies.at(-1)?.modelId;
    if (lastModel) rememberChatModel(activeChatId, lastModel);
  }, [activeChatId, persistedMessages, chats]);

  // ---- Scheduled prompts ("send when my limit resets") ----
  const scheduled = useScheduledPrompts();
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  useEffect(() => {
    if (scheduled.length === 0) return;
    const id = window.setInterval(() => setScheduleNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [scheduled.length]);
  // Due prompts send through the latest submitPrompt (it reads current state).
  const submitRef = useRef(submitPrompt);
  submitRef.current = submitPrompt;
  // When this chat's turn ends, its queued messages go out as one message.
  useEffect(() => {
    if (sendingChats[currentKey] || queued.length === 0) return;
    const next = mergeQueued(queued);
    setQueuedByChat((current) => ({ ...current, [currentKey]: [] }));
    if (!next) return;
    void submitRef.current(next.text || (next.annotations.length ? "Please address my notes." : next.text), next.modelId, next.attachments, next.reasoning, undefined, undefined, next.annotations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendingChats, currentKey, queued.length]);
  const sendScheduled = (item: ScheduledPrompt) => {
    removeScheduledPrompt(item.id);
    void submitRef.current(
      item.text,
      item.modelId,
      item.attachments,
      undefined,
      item.mode,
    );
  };
  useEffect(() => {
    const now = scheduleNow;
    const due = getScheduledPrompts().filter((item) => item.fireAt <= now);
    if (due.length === 0) return;
    // A chat that was deleted can't receive its prompt.
    for (const item of due) {
      // (A chat created a moment ago, e.g. by the orchestration MCP, may not
      // be in the list yet.)
      if (chats.length > 0 && !chats.some((chat) => chat.id === item.chatId) && now - item.createdAt > 60_000) {
        removeScheduledPrompt(item.id);
      }
    }
    const here = due.find((item) => item.chatId === activeChatId);
    if (here) {
      if (!sendingChats[here.chatId]) sendScheduled(here);
      return;
    }
    // Another chat is due: go there only if you've stepped away and the chat
    // in view isn't busy; otherwise the bar above the composer offers it.
    const elsewhere = due.find((item) =>
      chats.some((chat) => chat.id === item.chatId),
    );
    if (
      elsewhere &&
      !sendingChats[currentKey] &&
      idleFor(now) >= SCHEDULE_IDLE_MS
    ) {
      selectChat(elsewhere.chatId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleNow, scheduled, activeChatId, chats, sendingChats]);

  const scheduleFromLimit = (
    limit: NonNullable<ChatMessage["limit"]>,
    fireAt: number,
  ) => {
    if (!activeChatId) return;
    schedulePrompt({
      chatId: activeChatId,
      chatTitle: chats.find((chat) => chat.id === activeChatId)?.title ?? null,
      text: limit.text,
      modelId: limit.modelId,
      mode: limit.mode,
      attachments: limit.attachments,
      fireAt,
      reason: "limit",
    });
    // The failed turn was never saved; the queued bar now stands for it.
    setPendingByChat((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setScheduleNow(Date.now());
  };
  // Every other chat, newest first, for + → "Add a chat as context" (the
  // menu searches them, so this scales to any number of chats).
  const contextChats = useMemo(
    () =>
      [...chats]
        .filter((chat) => chat.id !== activeChatId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((chat) => ({
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt,
          project:
            projects.find((project) => project.id === chat.projectId)?.name ??
            null,
        })),
    [chats, projects, activeChatId],
  );

  // A chat dragged from the sidebar into the composer: attach its context.
  const convex = useConvex();
  const contextFromChat = async ({
    id,
    title,
  }: {
    id: string;
    title: string;
  }): Promise<StagedAttachment | null> => {
    if (id === activeChatId) return null;
    const rows = await convex.query(api.kode.getMessages, {
      chatId: id,
    });
    const history = (rows ?? [])
      .filter((row) => row.role !== "system" && row.content.trim())
      .map((row) => {
        const meta = row.metadata as { model?: string } | undefined;
        return {
          role: (row.role === "assistant" ? "assistant" : "user") as
            | "assistant"
            | "user",
          content: row.content,
          modelName:
            row.role === "assistant" && meta?.model
              ? getModelName(meta.model)
              : null,
        };
      });
    if (history.length === 0) return null;
    const todos = [...(rows ?? [])]
      .reverse()
      .map((row) => (row.metadata as { todos?: KodeTodo[] } | undefined)?.todos)
      .find((list) => list?.length);
    const handoff = buildHandoff({
      intro: `Context shared from another chat, "${title}". Use it as background for the request below; it is not a new instruction on its own.`,
      history,
      todos,
      budget: 16_000,
    });
    return {
      type: "file",
      id: `chat-${id}-${Date.now()}`,
      mediaType: "text/markdown",
      filename: `Context from "${title}".md`,
      url: "",
      text: handoff.text,
    };
  };

  // Limit hit on one account: the provider's other enabled, signed-in accounts.
  const otherAccounts = (modelId: string) => {
    const current = parseCliModelId(modelId);
    const instance = current ? getProvider(current.instanceId, appSettings) : undefined;
    if (!instance) return [];
    const group = accountGroups(appSettings).find((g) => g.key === accountKey(instance));
    return (group?.accounts ?? []).filter(
      (account) =>
        account.id !== instance.id &&
        account.enabled &&
        cliStatuses?.find((s) => s.instance === account.id)?.loggedIn !== false,
    );
  };

  const retryOnAccount = (limit: NonNullable<ChatMessage["limit"]>, account: Pick<ProviderInstance, "id" | "kind" | "preset">) => {
    const model = modelOnAccount(limit.modelId, account.id);
    if (!model) return;
    setActiveAccount(account);
    setSelectedModelId(model);
    setPendingByChat((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    // Next tick, so the picker and CLI lookups see the newly active account.
    window.setTimeout(() => void submitRef.current(limit.text, model, limit.attachments, undefined, limit.mode), 0);
  };

  const retryWithAnotherModel = (limit: NonNullable<ChatMessage["limit"]>) => {
    setPendingByChat((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setSeed((current) => ({ text: limit.text, nonce: current.nonce + 1 }));
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
          <ImportedChatBar
            className="mt-[4.5rem]"
            context={importContext}
            persisted={convexMessages}
            syncing={syncingImport}
            error={syncError}
            onSync={() => void syncImportedSession()}
            chatTitle={chats.find((chat) => chat.id === activeChatId)?.title ?? "Imported chat"}
          />
        ) : null}
        {inChat && activeChatId ? (
          <PrStatusBar
            chatId={activeChatId}
            projectRoot={activeProject?.path ?? null}
            className={importContext ? "mt-2" : "mt-[4.5rem]"}
          />
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
            <IncomingProjectMoves />
          </div>
        ) : messages.length === 0 && messagesLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground/35" />
          </div>
        ) : (
          <CodeRunContext.Provider value={codeRunTarget}>
          <Conversation className="min-h-0 flex-1 overflow-hidden">
            <ConversationContent
              style={inChat && bottomDockHeight ? { paddingBottom: bottomDockHeight + 24 } : undefined}
              className={`mx-auto w-full max-w-[51rem] gap-6 px-6 pb-28 ${importContext || syncError || hasPrBar ? "pt-4" : "pt-[4.5rem]"}`}
            >
              {messages.map((message, index) =>
                isWebhookEvent(message.role, message.content) ? (
                  <WebhookEventCard key={message.id} content={message.content} />
                ) : message.notice || isImportedTerminalDump(message.content) ? (
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
                    // Long chats (big imports): the browser skips layout and
                    // paint for turns off screen. The newest turns always
                    // render, so following the bottom stays exact.
                    className={
                      index < messages.length - 8
                        ? "[contain-intrinsic-size:auto_220px] [content-visibility:auto]"
                        : undefined
                    }
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
                              <ChainOfThought defaultOpen={false} className="mb-2">
                                <ChainOfThoughtHeader>
                                  {message.status === "thinking" && !message.content ? (
                                    <Shimmer>Thinking</Shimmer>
                                  ) : (
                                    "Thought"
                                  )}
                                </ChainOfThoughtHeader>
                                {reasoningText ? (
                                  <ChainOfThoughtContent>
                                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/60">
                                      {reasoningText}
                                    </div>
                                  </ChainOfThoughtContent>
                                ) : null}
                              </ChainOfThought>
                            );
                          })()}

                          {message.toolTodos && message.toolTodos.length > 0 ? (
                            <TodoSummary todos={message.toolTodos} />
                          ) : null}

                          {message.content ? (
                            <div
                              data-annotate-source={`Reply from ${getModelName(message.modelId ?? selectedModelId)}`}
                            >
                              <MessageResponse>{message.content}</MessageResponse>
                            </div>
                          ) : message.toolSteps?.length ? null : (
                            <div className="text-sm text-foreground/45">
                              Waiting for model response...
                            </div>
                          )}

                          {message.toolSteps && message.toolSteps.length > 0 ? (
                            <ToolStepList steps={message.toolSteps} />
                          ) : null}

                          {message.status === "error" && message.limit ? (
                            <LimitCard
                              resetAt={message.limit.resetAt}
                              now={scheduleNow}
                              canSchedule={Boolean(activeChatId)}
                              onSchedule={(fireAt) =>
                                scheduleFromLimit(message.limit!, fireAt)
                              }
                              onUseAnotherModel={() =>
                                retryWithAnotherModel(message.limit!)
                              }
                              switchTo={otherAccounts(message.limit.modelId).map((account) => ({
                                id: account.id,
                                label: account.label,
                                onSwitch: () => retryOnAccount(message.limit!, account),
                              }))}
                            />
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
                              setEditDraft(message.content.replace(/\n*```kode-image\n[\s\S]*?\n```/g, ""));
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
          </CodeRunContext.Provider>
        )}

        <div
          ref={inChat ? bottomDockRef : undefined}
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
          {inChat && activeChatId && !activeProject && !importContext?.projectPath && activeTab === "kode" ? (
            <div className="pointer-events-auto mx-auto mb-2 flex justify-center">
              <NoProjectBar inChat onPick={(projectId) => assignChatsToFolder([activeChatId], projectId)} className="liquid-glass-pill rounded-full px-3 py-1" />
            </div>
          ) : null}
          {inChat && dockPlan ? (
            <TodoDock todos={dockPlan.todos} running={isCurrentSending} planKey={dockPlan.key} compact={promptWaiting} />
          ) : null}
          {inChat && handoffTarget ? (
            <div className="pointer-events-none flex justify-center">
              <HandoffChip toModel={handoffTarget} onOpen={() => setHandoffOpen(true)} />
            </div>
          ) : null}
          {handoffOpen && handoffTarget ? (
            <HandoffPreviewDialog toModel={handoffTarget} load={loadHandoffPreview} onClose={() => setHandoffOpen(false)} />
          ) : null}
          {inChat ? (
            <div
              ref={setJumpSlot}
              className="pointer-events-none absolute inset-x-0 bottom-full z-40 mb-3 flex justify-center"
            />
          ) : null}
          <ChatInput
            onDropChat={contextFromChat}
            contextChats={contextChats}
            compact={inChat}
            skills={skills}
            projectRoot={projectRoot}
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
            topBar={(() => {
              const pending = [...messages]
                .reverse()
                .flatMap((message) => message.toolSteps ?? [])
                .find((step) => step.state === "pending-options" || step.state === "pending-approval");
              if (pending) {
                return (
                  <KodeComposerPrompt
                    step={pending}
                    onApprove={(id) => resolveApproval(id, true)}
                    onReject={(id, note) => {
                      if (note) setDenialNote(id, note);
                      resolveApproval(id, false);
                    }}
                    onOptions={resolveOptions}
                    onApproveAll={(id) => {
                      autoEditChats.current.add(activeChatId ?? DRAFT_KEY);
                      resolveApproval(id, true);
                    }}
                  />
                );
              }
              const hasScheduled = scheduled.some(
                (item) =>
                  item.chatId === activeChatId || item.fireAt <= scheduleNow,
              );
              if (!hasScheduled && queued.length === 0) return undefined;
              return (
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <QueuedMessages items={queued} onRemove={removeQueued} onSendNow={stopCurrentRun} />
                  {hasScheduled ? (
                    <ScheduledBar
                      items={scheduled}
                      activeChatId={activeChatId}
                      now={scheduleNow}
                      modelName={getModelName}
                      onSendNow={sendScheduled}
                      onCancel={(item) => removeScheduledPrompt(item.id)}
                      onOpenChat={(item) => selectChat(item.chatId)}
                    />
                  ) : null}
                </div>
              );
            })()}
            bottomBar={
              !inChat && !activeProject && activeTab === "kode" ? (
                <NoProjectBar onPick={(projectId) => newChat(projectId)} />
              ) : !inChat && activeProject ? (
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
            queueWhileLoading
            onSend={(text, mId, atts, _w, r) => {
              // Pending annotations go out with this message, then clear.
              const notes = takeAnnotations();
              if (isCurrentSending) {
                enqueue({ text, modelId: mId, attachments: atts, reasoning: r, annotations: notes });
                return;
              }
              void submitPrompt(
                text || (notes.length ? "Please address my notes." : text),
                mId,
                atts,
                r,
                undefined,
                undefined,
                notes,
              );
            }}
            mode={mode}
            onModeChange={setMode}
            seedText={seed.text}
            seedNonce={seed.nonce}
            placeholder={
              isCurrentSending
                ? "Kode is working. Type to queue a message…"
                : inChat
                  ? "Ask anything, @ to tag files or folders, / for commands"
                  : "What should we build or fix? @ for files, / for commands"
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
