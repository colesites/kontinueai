import { useUser } from "@clerk/clerk-react";
import {
  canUseKodeModel,
  KODE_DEFAULT_MODEL_ID,
  KODE_MODELS,
} from "@repo/ai/lib/kode";
import { useConvex, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  ClipboardList,
  Loader2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { CollapsibleUserText } from "@/components/chat/CollapsibleUserText";
import { UserAttachments } from "@/components/chat/UserAttachments";
import type { ChatTurn } from "@/components/chat/DesktopChatTurnNavigator";
import { TodoSummary } from "@/components/chat/TodoList";
import { TodoDock } from "@/components/chat/TodoDock";
import { KodeComposerPrompt } from "@/components/chat/KodeComposerPrompt";
import { ToolStepList } from "@/components/chat/ToolStep";
import { KodeComposerBar } from "@/components/kode/KodeComposerBar";
import KodeSessionImport from "@/components/kode/KodeSessionImport";
import { ModelPlanUsage } from "@/components/usage/ModelPlanUsage";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { useAppSettings, type ProviderInstance } from "@/lib/app-settings";
import { getScopedSettings, loadProjectSettings, useScopedSettings } from "@/lib/kode-scoped-settings";
import { getChatPrefs, setChatPrefs, useChatPrefs } from "@/lib/kode-chat-prefs";
import { api } from "@/lib/convex-api";
import { KODE_STARTER_PROMPTS } from "./plan/starter-prompts";
import {
  getModelName,
  HISTORY_PAGE,
  importedTerminalNotice,
  isImportedTerminalDump,
  normalizePlanTier,
  toChatMessage,
  toModelHistory,
  userParts,
  type ChatMessage,
} from "./plan/messages";
import { MessageMeta } from "./plan/MessageMeta";
import { SystemNotice } from "./plan/SystemNotice";
import { KodeTurnNavigator } from "./plan/KodeTurnNavigator";
import { ChatContextSummary } from "./plan/ChatContextSummary";
import { createSubmitPrompt } from "./plan/submit-prompt";
import {
  compactingSlot,
  DRAFT_KEY,
  EMPTY_CHAT_MESSAGES,
  pendingSlot,
  queuedSlot,
  sendingSlot,
} from "./plan/run-state";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import { accountGroups, accountKey, activeAccountId, modelOnAccount, nativeSessionBelongsTo, resolveSwitchTarget, setActiveAccount } from "@/lib/kode-accounts";
import { homeDir } from "@tauri-apps/api/path";
import { useSkills } from "@/hooks/use-skills";
import { discoverMcpTools, loadMcpConfigs, useMcpVersion } from "@/lib/kode-mcp";
import { pluginMcpConfigs, usePlugins } from "@/lib/kode-plugins";
import { loadConnectorTools } from "@/lib/kode-connectors";
import type { KodeExtraTool } from "@/lib/kode-agent";
import type { KodeToolDefinition } from "@/lib/kode-chat";
import { publishChatContext } from "@/lib/kode-chat-context";
import { liveModes, runAborts, useRunSlot } from "@/lib/kode-run-state";
import { interruptedReply } from "@/lib/kode-turn-notes";
import { clearCheckpoint, leftoverCheckpoints } from "@/lib/kode-turn-checkpoint";
import {
  contextTokensFor,
  forgetChatContextUsage,
  rememberChatContextEstimate,
  useChatContextUsage,
} from "@/lib/kode-context-usage";
import {
  cliNeedsLogin,
  cliPickerModels,
  getCliSession,
  getProvider,
  parseCliModelId,
  useCliStore,
} from "@/lib/kode-cli";
import { type CompactionState, estimateTokens } from "@/lib/kode-compact";
import {
  type ContextWindows,
  getContextWindow,
  loadContextWindows,
} from "@/lib/kode-context";
import { getImportContext, nativeContinueOf, providerLabel, saveImportContext } from "@/lib/kode-import";
import { resumeOffer, resumePrompt } from "@/lib/kode-import-resume";
import { ImportResumeCard } from "@/components/kode/ImportResumeCard";
import { setChatBusy, syncImportContext } from "@/lib/kode-import-sync";
import { ImportedChatBar, useImportContext, useImportSyncDeps } from "@/components/kode/ImportedChatBar";
import { IncomingProjectMoves } from "@/components/kode/ProjectMove";
import { NoProjectBar } from "@/components/kode/NoProjectBar";
import { PrStatusBar } from "@/components/kode/PrStatusBar";
import { isWebhookEvent, WebhookEventCard } from "@/components/kode/WebhookEventCard";
import { CodeRunContext } from "@/components/ai-elements/code-run-context";
import { envVarsFor } from "@/lib/kode-environments";
import { FILE_AND_SHELL_TOOLS, needsApproval, type KodeAgentMode, type KodeTodo } from "@/lib/kode-tools";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useReasoningPreference } from "@/lib/use-reasoning-preference";
import { LimitCard, ScheduledBar } from "@/components/kode/ScheduledPrompts";
import { mergeQueued, QueuedMessages, type QueuedMessage } from "@/components/chat/QueuedMessages";
import { buildHandoff } from "@/lib/kode-handoff";
import { redactSecrets, scanSecrets } from "@/lib/kode-secrets";
import { condenseSteps } from "@/lib/kode-steps";
import { setDenialNote } from "@/lib/kode-agent";
import { HandoffChip, HandoffPreviewDialog } from "@/components/kode/HandoffPreview";
import { getInterruptedTurn, interruptedTurnNote } from "@/lib/kode-tool-ledger";
import { gitStatus } from "@/components/panel/panel-api";
import { recordPrLinks } from "@/lib/kode-prs";
import { rememberChatModel } from "@/lib/kode-pr-watch";
import { publishSubagentModels } from "@/lib/kode-fanout";
import { claimScheduledPrompt } from "@/lib/kode-continuity";
import { takeAnnotations } from "@/lib/kode-annotations";
import { splitUserAttachments } from "@/lib/kode-attachments";
import {
  getScheduledPrompts,
  idleFor,
  removeScheduledPrompt,
  schedulePrompt,
  useScheduledPrompts,
  type ScheduledPrompt,
} from "@/lib/kode-schedule";

/** Switch to a chat with a due scheduled prompt only after this much idle time. */
const SCHEDULE_IDLE_MS = 2 * 60_000;

// Recover turns left by a previous run of the app once per launch.
let checkpointsRecovered = false;

const PlanView = () => {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName || "there";
  const planTier = normalizePlanTier(usePlanTier());
  const { reasoningEnabled: legacyReasoningEnabled, setReasoningEnabled } =
    useReasoningPreference();
  void legacyReasoningEnabled;
  // Each chat keeps its own model, mode, reasoning and context window
  // (kode-chat-prefs), so leaving and coming back shows it as you left it.
  // Settings → General only sets where a new chat starts.
  const { activeChatId: prefsChatId } = useKodeWorkspace();
  const prefsKey = prefsChatId ?? DRAFT_KEY;
  const prefsKeyRef = useRef(prefsKey);
  prefsKeyRef.current = prefsKey;
  const chatPrefs = useChatPrefs(prefsKey);
  const appDefaults = useAppSettings();
  const preferredModel = appDefaults.defaultKodeModel;
  // CLI models (Settings → Providers) are allowed too; the effect below
  // falls back to Kode if that provider isn't available.
  const defaultModelId =
    preferredModel && (KODE_MODELS.some((m) => m.id === preferredModel) || parseCliModelId(preferredModel))
      ? preferredModel
      : KODE_DEFAULT_MODEL_ID;
  const selectedModelId = chatPrefs.modelId ?? defaultModelId;
  const setSelectedModelId = useCallback((modelId: string) => setChatPrefs(prefsKeyRef.current, { modelId }), []);
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
  // The models sub-agents can use (your plan's Kode models and your own
  // agents), for agents that start them over Kontinue's MCP server.
  useEffect(() => {
    publishSubagentModels(
      kodeModels
        .filter((m) => parseCliModelId(m.id) || canUseKodeModel(m.id, planTier))
        .map((m) => ({ id: m.id, name: m.name, provider: m.provider })),
    );
  }, [kodeModels, planTier]);
  // A CLI model that was turned off (or whose CLI went away) falls back to Kode.
  // An empty or failed discovery must not clear the chat's saved model.
  useEffect(() => {
    const current = parseCliModelId(selectedModelId);
    if (!cliStatuses?.length || cliStore.checking || !current) return;
    if (cliStore.modelErrors[current.instanceId]) return;
    if (kodeModels.some((m) => m.id === selectedModelId)) return;
    const instance = getProvider(current.instanceId, appSettings);
    const activeId = instance ? activeAccountId(accountKey(instance), appSettings.kodeProviders, appSettings.kodeActiveAccounts) : null;
    const moved = activeId ? modelOnAccount(selectedModelId, activeId) : null;
    setSelectedModelId(moved && kodeModels.some((m) => m.id === moved) ? moved : KODE_DEFAULT_MODEL_ID);
  }, [cliStatuses, cliStore.checking, cliStore.modelErrors, kodeModels, selectedModelId, appSettings, setSelectedModelId]);

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
  const cliNotSignedIn = selectedCli && cliNeedsLogin(cliStatuses, selectedCli.id) ? selectedCli : null;
  // All in-flight state is keyed by chat id (or DRAFT_KEY for an unsaved home
  // chat) so multiple chats/projects can run concurrently and switching chats
  // shows the correct per-chat loading + overlay.
  // These live outside the component (kode-run-state.ts) so a turn that is
  // still running is there when you come back to Kode.
  const [pendingByChat, setPendingByChat] = useRunSlot(pendingSlot);
  const [sendingChats, setSendingChats] = useRunSlot(sendingSlot);
  // Per-chat flag: the summarizer is folding older turns to fit the model window.
  const [compactingChats, setCompactingChats] = useRunSlot(compactingSlot);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [seed, setSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  // Design mode isn't available yet; fall back to Supervised.
  const defaultMode: KodeAgentMode = appDefaults.defaultKodeMode === "design" ? "supervised" : appDefaults.defaultKodeMode;
  const mode = chatPrefs.mode ?? defaultMode;
  const setMode = useCallback((next: KodeAgentMode) => setChatPrefs(prefsKeyRef.current, { mode: next }), []);
  // Per-model context windows (OpenRouter + Vercel gateway), loaded once.
  const [contextWindows, setContextWindows] = useState<ContextWindows>({});
  useEffect(() => {
    void loadContextWindows().then(setContextWindows);
  }, []);
  // Per-chat compaction summary cache + which chats have been compacted (for UI).
  const compactionByChat = useRef<Map<string, CompactionState>>(new Map());
  // Per-run AbortController so the Stop button can cancel an in-flight agent run.
  const abortByChat = useRef(runAborts);
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
  // Read when a drafted title arrives, to leave a chat the user renamed alone.
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  // Kode chats only, whichever tab is open when the drafted title arrives.
  const updateKodeChatTitle = useMutation(api.kode.updateChatTitle);
  // A mode change applies to this chat's running turn too: the agent reads it
  // before each step, and a step waiting for approval goes ahead if the new
  // mode wouldn't have asked about it.
  const modeChatKey = activeChatId ?? DRAFT_KEY;
  useEffect(() => {
    if (!sendingSlot.get()[modeChatKey]) return;
    liveModes.set(modeChatKey, mode);
    if (mode === "plan") return;
    for (const step of runtime.pendingByChat[modeChatKey] ?? []) {
      if (step.state !== "pending-approval") continue;
      if (!FILE_AND_SHELL_TOOLS.has(step.name)) continue;
      if (!needsApproval(step.name, mode, step.args)) runtime.resolveApproval(step.id, true);
    }
  }, [mode, modeChatKey, runtime]);

  // A reply that was still streaming when Kontinue last quit: save it into
  // its chat with a note, so the work and the point it stopped at are kept.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per launch
  useEffect(() => {
    if (checkpointsRecovered) return;
    checkpointsRecovered = true;
    const leftovers = leftoverCheckpoints((chatId) => !!sendingSlot.get()[chatId]);
    void (async () => {
      for (const checkpoint of leftovers) {
        try {
          if (checkpoint.userText) {
            await addMessageRecord({ chatId: checkpoint.chatId, role: "user", content: checkpoint.userText, model: checkpoint.modelId });
          }
          await addMessageRecord({
            chatId: checkpoint.chatId,
            role: "assistant",
            content: interruptedReply(
              checkpoint.reply,
              "Kontinue was closed before this reply finished.",
              (checkpoint.todos ?? []) as KodeTodo[],
            ),
            model: checkpoint.modelId,
            todos: checkpoint.todos,
          });
          clearCheckpoint(checkpoint.chatId);
        } catch (error) {
          // Offline: try again next launch. A deleted chat can't take it.
          if (/not found|unauthori[sz]ed/i.test(String(error))) clearCheckpoint(checkpoint.chatId);
        }
      }
    })();
  }, []);

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
  // A new session in a project starts from that project's defaults: once, when
  // the draft moves to that project. Coming back to the draft keeps your picks.
  useEffect(() => {
    if (activeChatId || !projectRoot) return;
    if (getChatPrefs(DRAFT_KEY).root === projectRoot) return;
    void loadProjectSettings(projectRoot).then(() => {
      const scoped = getScopedSettings(projectRoot);
      setChatPrefs(DRAFT_KEY, {
        root: projectRoot,
        modelId:
          scoped.defaultKodeModel && KODE_MODELS.some((m) => m.id === scoped.defaultKodeModel)
            ? scoped.defaultKodeModel
            : undefined,
        mode: scoped.defaultKodeMode && scoped.defaultKodeMode !== "design" ? scoped.defaultKodeMode : undefined,
      });
    });
  }, [projectRoot, activeChatId]);
  // This chat's reasoning and window: its own choice, else the project's or
  // Settings' default.
  const chatReasoning = chatPrefs.reasoning ?? scopedSettings.kodeReasoning;
  const chatContextChoice =
    chatPrefs.contextWindow !== undefined ? chatPrefs.contextWindow : scopedSettings.kodeContextWindow;
  const reasoningEnabled = chatReasoning !== "off";

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
      // The history was cut back: the last reported total no longer applies.
      if (activeChatId) forgetChatContextUsage(activeChatId);
    } catch {
      // Ignore — Convex will surface its own error; the input is already seeded.
    }
  };

  const priorHistory = (index: number) => toModelHistory(messages.slice(0, index));

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
    if (activeChatId) setChatPrefs(chatId, getChatPrefs(activeChatId));
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
    const persisted =
      !messageId.startsWith("user-") && !messageId.startsWith("assistant-");
    // Older messages may not be loaded: build the history from all of them.
    let history = priorHistory(index);
    if (persisted && hasEarlierMessages) {
      const all = await allPersistedMessages();
      const at = all.findIndex((message) => message.id === messageId);
      if (at >= 0) history = toModelHistory(all.slice(0, at));
    }
    if (persisted) {
      await rewindAfter(messageId);
      if (activeChatId) forgetChatContextUsage(activeChatId);
    }
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

  // History loads a page at a time (newest first); "Show earlier messages"
  // asks for more. The full history is only read when a turn needs it.
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat starts at one page
  useEffect(() => setHistoryLimit(HISTORY_PAGE), [activeChatId]);
  const recentPage = useQuery(
    api.kode.getRecentMessages,
    isKodeChat && activeChatId ? { chatId: activeChatId, limit: historyLimit } : "skip",
  );
  // Keep showing the current page while a bigger one loads (no flash).
  const { isAuthenticated } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();
  const liveHistory = isAuthenticated && isWebSocketConnected;
  const [lastPage, setLastPage] = useState<{ chatId: string; page: NonNullable<typeof recentPage> } | null>(null);
  useEffect(() => {
    if (recentPage && activeChatId && liveHistory) setLastPage({ chatId: activeChatId, page: recentPage });
  }, [recentPage, activeChatId, liveHistory]);
  const shownPage =
    (liveHistory ? recentPage : undefined) ?? (lastPage?.chatId === activeChatId ? lastPage.page : undefined);
  const convexMessages = shownPage?.messages;
  const hasEarlierMessages = shownPage?.hasMore ?? false;

  // General token budget for the signed-in user (daily + weekly). Used to block a
  // turn before it runs when the budget is exhausted.

  // Chats from before each chat remembered its settings: carry on with the
  // model that answered last instead of the default.
  useEffect(() => {
    if (!activeChatId || !convexMessages || getChatPrefs(activeChatId).modelId) return;
    const last = [...convexMessages].reverse().find((m) => m.role === "assistant" && m.metadata?.model)?.metadata?.model;
    if (last && kodeModels.some((m) => m.id === last)) setChatPrefs(activeChatId, { modelId: last });
  }, [activeChatId, convexMessages, kodeModels]);
  const persistedMessages = useMemo<ChatMessage[]>(
    () => (convexMessages ?? []).map((message) => toChatMessage(message, selectedModelId)),
    [convexMessages, selectedModelId],
  );
  // Every saved message of this chat, for the model: the loaded page when
  // that's all there is, otherwise read once from Convex.
  const allPersistedMessages = async (): Promise<ChatMessage[]> => {
    if (!activeChatId || !hasEarlierMessages) return persistedMessages;
    const rows = await convex.query(api.kode.getMessages, { chatId: activeChatId });
    return rows.map((message) => toChatMessage(message, selectedModelId));
  };

  const currentKey = activeChatId ?? DRAFT_KEY;

  // ---- Messages typed while Kode is working (sent when the turn ends) ----
  const [queuedByChat, setQueuedByChat] = useRunSlot(queuedSlot);
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
    () => [...persistedMessages, ...overlay.filter((item) => !item.saved)],
    [persistedMessages, overlay],
  );
  const isCurrentSending = !!sendingChats[currentKey];
  // An imported session that stopped on a usage limit: offer to carry on.
  const resumeOfferNow = useMemo(
    () => (importContext ? resumeOffer(importContext, persistedMessages) : null),
    [importContext, persistedMessages],
  );
  const isCompacting = !!compactingChats[currentKey];
  // Context usage lives in a module store keyed by chat id, so leaving the Kode
  // tab (which unmounts this view) or switching chats doesn't lose the number.
  const contextUsage = useChatContextUsage(activeChatId);
  const latestUsage = contextUsage?.usage;
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

  // Settings → Source control → "New threads start in": a new thread's first
  // message creates a git worktree on its own branch and runs there. Falls
  // back to the project folder when it isn't a git repo.

  // Stop the in-flight run for the chat currently in view.
  const stopCurrentRun = () => {
    abortByChat.current.get(currentKey)?.abort();
    // A turn waiting on you (an approval or a question) only checks for Stop
    // once that is answered, so it hung: decline whatever is waiting.
    for (const step of runtime.pendingByChat[currentKey] ?? []) {
      if (step.state === "pending-approval") runtime.resolveApproval(step.id, false);
      else if (step.state === "pending-options") runtime.resolveOptions(step.id, []);
    }
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
  // One turn from a typed message to a saved reply (plan/submit-prompt.tsx).
  const submitPrompt = createSubmitPrompt({
    chats, activeChatId, draftProjectId, createChatRecord, addMessageRecord, selectChat,
    rewindAfter, ensureFolder, abortByChat, allPersistedMessages, appSettings, autoEditChats,
    chatPrefs, chatReasoning, cliStatuses, cliStore, compactionByChat, composeHandoff,
    connectorTools, contextWindows, homeDirRef, importContext, kodeModels, mcpTools, chatsRef, mode,
    persistedMessages, planTier, plugins, projectRoot, reasoningEnabled, runtime, selectedModelId,
    sendingChats, setCompactedChats, setCompactingChats, setPendingByChat, setScheduleNow,
    setSelectedModelId, setSendingChats, skills, switchAccount, updateKodeChatTitle,
  });
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
    // Another open computer may have sent it already (kode-continuity.ts).
    void claimScheduledPrompt(item).then((mine) => {
      if (!mine) return;
      void submitRef.current(
        item.text,
        item.modelId,
        item.attachments,
        undefined,
        item.mode,
      );
    });
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

  // Whole-chat context usage. Three sources, in order of trust:
  //   1. the provider's own count for the last turn (exact tokenizer, includes
  //      system prompt + tool schemas) — kept in the shared store so it survives
  //      a chat switch, a remount and a restart;
  //   2. an estimate from the persisted history (chars/4, no system prompt);
  //   3. nothing yet — the chat's history is still loading.
  // The old code returned 0 for case 3 whenever `messages` was momentarily empty,
  // which is exactly the frame Convex returns `undefined` on a chat switch: the
  // meter flashed 0% before settling. `historyLoaded` distinguishes "empty chat"
  // from "not loaded yet", and the store keeps the last known number meanwhile.
  const historyLoaded = !messagesLoading || messages.length > 0;
  const importTokens =
    messages.length > 0 && importContext
      ? Math.ceil(importContext.contextPrompt.length / 4)
      : 0;
  const estimate = estimateTokens(messages) + importTokens;
  const usedTokens =
    messages.length === 0 && !contextUsage
      ? 0
      : contextTokensFor(
          contextUsage,
          parseCliModelId(selectedModelId) ? "cli" : "api",
        ) || estimate;
  // Keep the estimate warm per chat, so switching back shows a number before
  // Convex answers and an emptied history clears it.
  useEffect(() => {
    if (!activeChatId || !historyLoaded) return;
    rememberChatContextEstimate(activeChatId, messages.length === 0 ? null : estimate);
  }, [activeChatId, historyLoaded, messages.length, estimate]);
  // The meter and the send path must agree on the window: both use the scoped
  // setting (project / environment overrides), not the global one.
  const contextWindow = getContextWindow(
    selectedModelId,
    contextWindows,
    chatContextChoice,
    getModelName(selectedModelId),
  );
  useEffect(() => {
    publishChatContext({
      used: usedTokens,
      max: contextWindow,
      modelName: getModelName(selectedModelId),
      modelId: selectedModelId,
    });
  }, [usedTokens, contextWindow, selectedModelId]);
  // Leaving Kode (this view unmounts) shouldn't leave the workspace panel's
  // Environment tab showing the last chat's number.
  useEffect(() => () => publishChatContext(null), []);
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
            loadPersisted={allPersistedMessages}
            syncing={syncingImport}
            error={syncError}
            onSync={() => void syncImportedSession()}
            chatTitle={chats.find((chat) => chat.id === activeChatId)?.title ?? "Imported chat"}
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
              className={`mx-auto w-full max-w-[51rem] gap-6 px-6 pb-28 ${importContext || syncError ? "pt-4" : "pt-[4.5rem]"}`}
            >
              {hasEarlierMessages ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setHistoryLimit((limit) => limit + HISTORY_PAGE)}
                    disabled={recentPage === undefined}
                    className="kontinue-3d flex h-8 items-center gap-1.5 rounded-full px-3.5 text-label text-foreground/85 hover:text-foreground disabled:opacity-60"
                  >
                    {recentPage === undefined ? <Loader2 size={12} className="animate-spin" /> : null}
                    Show earlier messages
                  </button>
                </div>
              ) : null}
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
                    {message.role === "user" ? <UserAttachments {...userParts(message.content)} /> : null}
                    <MessageContent
                      className={
                        message.role === "user" && !userParts(message.content).text && editingMessageId !== message.id
                          ? "hidden"
                          : undefined
                      }
                    >
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
                                    <div className="whitespace-pre-wrap text-body leading-relaxed text-foreground/60">
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
                          <MessageResponse>{userParts(message.content).text}</MessageResponse>
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
                              setEditDraft(splitUserAttachments(message.content).text);
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
                    <p className="min-w-0 flex-1 text-body text-foreground/85">
                      Ready to build this plan?
                    </p>
                    <button
                      type="button"
                      onClick={() => approve("supervised")}
                      className="kontinue-3d h-8 cursor-pointer rounded-full px-3.5 text-label text-foreground/85 hover:text-foreground"
                    >
                      Approve, review each edit
                    </button>
                    <button
                      type="button"
                      onClick={() => approve("auto_edits")}
                      className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-3.5 text-label font-medium"
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
          {/* The chat's pull request sits with the plan, right above the
              input, so Merge is where your hands already are. */}
          {inChat && activeChatId && importContext && resumeOfferNow && !isCurrentSending ? (
            <ImportResumeCard
              offer={resumeOfferNow}
              provider={providerLabel(importContext.provider)}
              onDismiss={() => saveImportContext({ ...importContext, resumeHandled: true })}
              onContinue={() => {
                saveImportContext({ ...importContext, resumeHandled: true });
                // Continuing now replaces the continue queued for the reset time.
                for (const item of getScheduledPrompts()) {
                  if (item.chatId === importContext.chatId && item.reason === "limit") removeScheduledPrompt(item.id);
                }
                void submitPrompt(resumePrompt(resumeOfferNow));
              }}
            />
          ) : null}
          {inChat && activeChatId ? (
            <PrStatusBar chatId={activeChatId} projectRoot={activeProject?.path ?? null} />
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
                  <ContextTrigger className="h-6 gap-1 rounded-md px-1 text-caption text-foreground/55 kontinue-hover hover:text-foreground [&_svg]:size-3" />
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
                    <ModelPlanUsage
                      modelId={selectedModelId}
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
                      <ContextTrigger className="h-6 gap-1 rounded-md px-1 text-caption text-foreground/55 kontinue-hover hover:text-foreground [&_svg]:size-3" />
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
                        <ModelPlanUsage
                          modelId={selectedModelId}
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
            chatReasoning={chatReasoning}
            chatContextWindow={chatContextChoice}
            resolvedContextWindow={contextWindow}
            onChatReasoningChange={(next) => setChatPrefs(prefsKeyRef.current, { reasoning: next })}
            onChatContextWindowChange={(next) => setChatPrefs(prefsKeyRef.current, { contextWindow: next })}
          />

          {showSummary && compactionByChat.current.get(currentKey) ? (
            <div className="mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-caption font-medium uppercase text-foreground/45">
                  Compacted context summary
                </span>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="text-caption text-foreground/40 hover:text-foreground/70"
                >
                  Close
                </button>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-label text-foreground/65">
                {compactionByChat.current.get(currentKey)?.summary}
              </pre>
            </div>
          ) : null}

          {cliNotSignedIn || isCompacting || compactedChats[currentKey] ? (
            <div className="mt-2 flex items-center justify-end gap-2">
              {/* Which plan an agent uses is in the model picker; here only when it can't run. */}
              {cliNotSignedIn ? (
                <span className="mr-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-caption text-amber-600 dark:text-amber-400">
                  {cliNotSignedIn.label} is not signed in. Sign in from Settings → Providers
                </span>
              ) : null}
              {isCompacting ? (
                <span className="mr-auto flex items-center gap-1.5 text-caption text-foreground/45">
                  <Loader2 className="size-3 animate-spin" />
                  <Shimmer>Compacting context…</Shimmer>
                </span>
              ) : null}
              {compactedChats[currentKey] ? (
                <button
                  type="button"
                  onClick={() => setShowSummary((v) => !v)}
                  className="text-caption text-foreground/40 underline-offset-2 hover:text-foreground/70 hover:underline"
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
                  <p className="text-label text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 leading-relaxed group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
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

export default PlanView;
