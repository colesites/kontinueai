// The Kode send path (submitPrompt), moved out of PlanView.tsx. It runs one
// turn: slash commands, attachments, the Kode agent or a CLI agent, saving the
// messages, usage limits and failures.

import { canUseKodeModel } from "@repo/ai/lib/kode";
import { useMutation } from "convex/react";
import { type StagedAttachment } from "@/components/chat/ChatInput";
import { CHAT_APPROVABLE_TOOLS } from "@/components/chat/KodeComposerPrompt";
import { getSettings, useAppSettings } from "@/lib/app-settings";
import { getScopedSettings } from "@/lib/kode-scoped-settings";
import { moveChatPrefs, setChatPrefs, useChatPrefs } from "@/lib/kode-chat-prefs";
import { getModelControls, rememberModelWindow } from "@/lib/model-controls";
import { effortFor } from "@/components/chat/KodeReasoningPopover";
import { api } from "@/lib/convex-api";
import { draftChatTitle, needsDraftTitle, quickTitle } from "@/lib/kode-chat-title";
import { getModelName, KodeLimitError, type ChatMessage } from "./messages";
import { type KodeToolStep, runKodeAgent } from "@/lib/kode-agent";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import { expandSlashPrompt, resolveSlash } from "@/lib/kode-commands";
import { pickTriageModel, triagePrompt, triageReport } from "@/lib/kode-triage";
import { nativeSessionBelongsTo } from "@/lib/kode-accounts";
import { useSkills } from "@/hooks/use-skills";
import { getActiveSkills, setActiveSkills } from "@/lib/kode-skills";
import { usePlugins } from "@/lib/kode-plugins";
import { buildPluginAgentTool } from "@/lib/kode-plugin-agents";
import { hasHooks, runHooks } from "@/lib/kode-hooks";
import type { KodeExtraTool } from "@/lib/kode-agent";
import type { KodeContentPart, KodeToolDefinition } from "@/lib/kode-chat";
import { createDeltaBatcher, liveModes, runAborts, useRunSlot } from "@/lib/kode-run-state";
import { interruptedReply } from "@/lib/kode-turn-notes";
import { clearCheckpoint } from "@/lib/kode-turn-checkpoint";
import { clearReportedChatContextUsage, recordChatContextUsage } from "@/lib/kode-context-usage";
import {
  cliLoginCommand,
  cliPickerModels,
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
import { type CompactionState, compactHistory, needsCompaction } from "@/lib/kode-compact";
import { type ContextWindows, getContextWindow } from "@/lib/kode-context";
import { getImportContext, nativeContinueOf, readCodingSession, saveImportContext } from "@/lib/kode-import";
import { invoke } from "@tauri-apps/api/core";
import { resolveConflict } from "@/lib/kode-import-sync";
import { useImportContext } from "@/components/kode/ImportedChatBar";
import { type KodeAgentMode, type KodeTodo } from "@/lib/kode-tools";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { notifyRunEvent } from "@/lib/kode-notify";
import { addWorktree, isWorktreePath, threadBranch } from "@/lib/kode-branches";
import { cleanLimitMarker, detectLimit } from "@/lib/kode-limits";
import { describeHandoff } from "@/lib/kode-handoff";
import { scrubHistory } from "@/lib/kode-secrets";
import { condenseSteps, withSteps } from "@/lib/kode-steps";
import { clearInterruptedTurn, getInterruptedTurn, interruptedTurnNote, ledgerFromSteps, recordInterruptedTurn } from "@/lib/kode-tool-ledger";
import { buildSubagentTool } from "@/lib/kode-fanout";
import { formatEditorContext, getEditorContext } from "@/lib/editor-context";
import { annotationTitle, formatAnnotations, type KodeAnnotation } from "@/lib/kode-annotations";
import { saveAttachmentsToProject, savedAttachmentsNote } from "@/lib/kode-attachments";
import { schedulePrompt, RESET_BUFFER_MS } from "@/lib/kode-schedule";

/** Switch to a chat with a due scheduled prompt only after this much idle time. */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { KodeEffort, KodePlan } from "@repo/ai/lib/kode";
import type { AnyModelOption } from "@/components/chat/ModelPickerPopover";
import type { Handoff } from "@/lib/kode-handoff";
import { scanSecrets } from "@/lib/kode-secrets";
import { DRAFT_KEY, pendingSlot } from "./run-state";

type Workspace = ReturnType<typeof useKodeWorkspace>;
type SlotSetter<T> = ReturnType<typeof useRunSlot<T>>[1];

/** Everything the send path reads from the chat view. */
export type SubmitDeps = Pick<
  Workspace,
  "chats" | "activeChatId" | "draftProjectId" | "createChatRecord" | "addMessageRecord" | "selectChat" | "rewindAfter" | "ensureFolder"
> & {
  abortByChat: MutableRefObject<typeof runAborts>;
  allPersistedMessages: () => Promise<ChatMessage[]>;
  appSettings: ReturnType<typeof useAppSettings>;
  autoEditChats: MutableRefObject<Set<string>>;
  chatPrefs: ReturnType<typeof useChatPrefs>;
  chatReasoning: KodeEffort | "off";
  cliStatuses: ReturnType<typeof useCliStore>["statuses"];
  cliStore: ReturnType<typeof useCliStore>;
  compactionByChat: MutableRefObject<Map<string, CompactionState>>;
  composeHandoff: (
    modelId: string,
    historyOverride?: { role: "user" | "assistant"; content: string }[],
    withInterrupted?: boolean,
  ) => Promise<ComposedHandoff | null>;
  /** Read when a drafted title arrives (a renamed chat keeps its name). */
  chatsRef: MutableRefObject<Workspace["chats"]>;
  connectorTools: KodeExtraTool[];
  contextWindows: ContextWindows;
  homeDirRef: MutableRefObject<string>;
  importContext: ReturnType<typeof useImportContext>;
  kodeModels: AnyModelOption[];
  mcpTools: KodeToolDefinition[];
  mode: KodeAgentMode;
  persistedMessages: ChatMessage[];
  planTier: KodePlan;
  plugins: ReturnType<typeof usePlugins>;
  projectRoot: string | null;
  reasoningEnabled: boolean;
  runtime: ReturnType<typeof useKodeAgentRuntime>;
  selectedModelId: string;
  sendingChats: Record<string, boolean>;
  setCompactedChats: Dispatch<SetStateAction<Record<string, boolean>>>;
  setCompactingChats: SlotSetter<Record<string, boolean>>;
  setPendingByChat: SlotSetter<Record<string, ChatMessage[]>>;
  setScheduleNow: Dispatch<SetStateAction<number>>;
  setSelectedModelId: (modelId: string) => void;
  setSendingChats: SlotSetter<Record<string, boolean>>;
  skills: ReturnType<typeof useSkills>["skills"];
  switchAccount: (query: string) => void;
  updateKodeChatTitle: ReturnType<typeof useMutation<typeof api.kode.updateChatTitle>>;
};

/** The chat so far, summarized for a model switch (PlanView composeHandoff). */
export type ComposedHandoff = {
  handoff: Handoff;
  redactions: number;
  kinds: ReturnType<typeof scanSecrets>[number]["kind"][];
  fromModel: string | null;
};

/**
 * The Kode send path: one turn from a typed message to a saved reply, through
 * a Kode model or the user's own agent (Claude Code, Codex, …). Made per render
 * from the chat view's current state, like the inline function it replaced.
 */
export function createSubmitPrompt(deps: SubmitDeps) {
  const {
    chats, activeChatId, draftProjectId, createChatRecord, addMessageRecord, selectChat, rewindAfter, ensureFolder,
    abortByChat, allPersistedMessages, appSettings, autoEditChats, chatPrefs, chatReasoning, cliStatuses, cliStore,
    compactionByChat, composeHandoff, connectorTools, contextWindows, homeDirRef, importContext, kodeModels, mcpTools,
    chatsRef, mode, persistedMessages, planTier, plugins, projectRoot, reasoningEnabled, runtime,
    selectedModelId, sendingChats, setCompactedChats, setCompactingChats, setPendingByChat, setScheduleNow,
    setSelectedModelId, setSendingChats, skills, switchAccount, updateKodeChatTitle,
  } = deps;

  const workspaceForNewThread = async (text: string): Promise<{ root: string | null; projectId: string | null }> => {
    const base = { root: projectRoot, projectId: draftProjectId ?? null };
    if (activeChatId || !projectRoot || sendingChats[DRAFT_KEY] || text.trim().startsWith("/")) return base;
    if (getSettings().newThreadWorkspace !== "worktree" || isWorktreePath(projectRoot)) return base;
    try {
      const path = await addWorktree(projectRoot, threadBranch(text));
      return { root: path, projectId: ensureFolder(path) };
    } catch (error) {
      console.warn("[Kode] New worktree failed, using the project folder:", error);
      return base;
    }
  };

  /**
   * Save a failed turn that is still only on screen (a usage-limit card, or a
   * turn whose save failed) so the next message adds to the chat instead of
   * replacing it. Returns what could not be saved, to keep showing.
   */
  const settleLeftoverTurn = async (chatKey: string, chatId: string | null): Promise<ChatMessage[]> => {
    const leftover = (pendingSlot.get()[chatKey] ?? []).filter((item) => !item.notice && !item.saved);
    if (leftover.length === 0) return [];
    const unsaved: ChatMessage[] = [];
    for (const item of leftover) {
      if (!chatId || !item.content.trim()) {
        if (item.content.trim()) unsaved.push(item);
        continue;
      }
      try {
        await addMessageRecord({
          chatId,
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.role === "assistant" ? withSteps(item.content, item.toolSteps ?? []) : item.content,
          model: item.modelId,
          todos: item.toolTodos?.length ? item.toolTodos : undefined,
        });
      } catch {
        unsaved.push(item);
      }
    }
    return unsaved;
  };

  const submitPrompt = async (
    text: string,
    modelId = selectedModelId,
    attachments?: StagedAttachment[],
    sendReasoningEnabled?: boolean,
    modeOverride?: KodeAgentMode,
    historyOverride?: { role: "user" | "assistant"; content: string }[],
    annotations: KodeAnnotation[] = [],
  ) => {
    // Everything below runs in this thread's folder (maybe a fresh worktree).
    const workspace = await workspaceForNewThread(text);
    const projectRoot = workspace.root;
    const draftProjectId = workspace.projectId;
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
    // What's open in the file editor (and any selection) rides along so the
    // agent can act on "this file" / "this function".
    const editorNote = formatEditorContext(getEditorContext(projectRoot));
    const modelText = `${interruptedPrefix}${expandedText}${fileBlocks}${savedAttachmentsNote(savedFiles)}${formatAnnotations(annotations)}${editorNote}`;
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
    liveModes.set(key, activeMode);

    setSendingChats((current) => ({ ...current, [key]: true }));
    runtime.setRunning(key, true);
    // A failed turn still on screen is saved before this one starts, so a new
    // message never replaces it. Whatever can't be saved stays above.
    const kept = await settleLeftoverTurn(key, activeChatId);
    setPendingByChat((current) => ({
      ...current,
      [key]: [...kept, userMessage, thinkingMessage],
    }));
    const runItemIds = new Set([userMessage.id, thinkingMessage.id]);
    // Remove this turn's own bubbles, leaving anything else in the overlay.
    const dropRunItems = (chatKey: string) =>
      setPendingByChat((current) => {
        const rest = (current[chatKey] ?? []).filter((item) => !runItemIds.has(item.id));
        const next = { ...current };
        if (rest.length) next[chatKey] = rest;
        else delete next[chatKey];
        return next;
      });

    // History only exists for an already-active chat (draft sends start empty).
    const history =
      historyOverride ??
      (await allPersistedMessages()).reduce<
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
    // Applies streamed text that is still batched (set once streaming starts).
    let flushStream = () => {};
    // Your message is saved as soon as the chat exists, not when the reply
    // ends, so quitting or a crash mid-turn never loses what you asked.
    let userMessageId: string | null = null;
    const saveUserMessage = async (id: string) => {
      try {
        userMessageId = await addMessageRecord({ chatId: id, role: "user", content: displayText, model: modelId });
        setPendingByChat((current) => ({
          ...current,
          [runKey]: (current[runKey] ?? []).map((item) => (item.id === userMessage.id ? { ...item, saved: true } : item)),
        }));
      } catch {
        // Offline or similar: it is saved with the reply instead.
      }
    };
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
        // A long first message: let Kode 1.0 name the chat while the reply
        // runs. Skipped if the user renamed it in the meantime.
        if (needsDraftTitle(text)) {
          const initialTitle = quickTitle(text);
          void draftChatTitle(text).then((title) => {
            const current = chatsRef.current.find((chat) => chat.id === newId)?.title;
            if (!title || (current !== undefined && current !== initialTitle)) return;
            void updateKodeChatTitle({ chatId: newId as any, title }).catch(() => {});
          });
        }
        // The new chat keeps what the draft was set to; the next new chat
        // starts from the defaults again.
        moveChatPrefs(DRAFT_KEY, newId);
        setChatPrefs(newId, { modelId, mode: activeMode });
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
        liveModes.set(newId, liveModes.get(key) ?? activeMode);
        runKey = newId;
      }
      await saveUserMessage(chatId);

      // Live-update the in-flight assistant bubble as reasoning/content tokens
      // stream in, so the chain-of-thought fills in progressively.
      const assistantId = thinkingMessage.id;
      const streamed = createDeltaBatcher<"reasoning" | "content">((field, text) =>
        setPendingByChat((current) => ({
          ...current,
          [runKey]: (current[runKey] ?? []).map((item) =>
            item.id === assistantId
              ? { ...item, [field]: (item[field] ?? "") + text }
              : item,
          ),
        })),
      );
      flushStream = streamed.flush;
      const applyDelta = (field: "reasoning" | "content", delta: string) => {
        // Once stopped, ignore any tokens still arriving from the orphaned stream.
        if (abortController.signal.aborted) return;
        streamed.push(field, delta);
      };

      // Upsert a tool step into the in-flight assistant bubble so its approval /
      // status card renders and updates as the agent runs.
      const upsertToolStep = (step: KodeToolStep) => {
        // Text streamed before this step shows above its card.
        streamed.flush();
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
          // Its agent can start Kontinue sub-agents that show under this chat.
          parentChatId: cliChatId,
          // Claude Code and Codex take an effort level; agents that pick it
          // themselves (Cursor, ACP, or a level in the model's name) get none.
          effort: (() => {
            if (chatReasoning === "off") return null;
            const { efforts } = getModelControls(modelId, getSettings(), getModelName(modelId));
            return effortFor(efforts, chatReasoning);
          })(),
          signal: abortController.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "usage":
                if (event.window) rememberModelWindow(modelId, event.window);
                if (event.used) {
                  recordChatContextUsage(cliChatId, {
                    inputTokens: event.used,
                    outputTokens: 0,
                    totalTokens: event.used,
                  } as Parameters<typeof recordChatContextUsage>[1]);
                }
                break;
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
        if (!userMessageId) {
          await addMessageRecord({ chatId, role: "user", content: displayText, model: modelId });
        }
        await addMessageRecord({
          chatId,
          role: "assistant",
          content: withSteps(content, [...turnSteps.values()]),
          model: modelId,
          todos: latestTodos.length > 0 ? latestTodos : undefined,
        });
        // The CLI counts its own prompt; our last provider total is stale.
        clearReportedChatContextUsage(chatId);
        dropRunItems(runKey);
        return;
      }

      // Auto-compaction: if the conversation is near the model's window, summarize
      // older turns and send [summary, ...recent] instead. Original messages stay.
      // Surface a "Compacting context…" indicator only when it will actually run
      // (summarizing a large history can take a moment).
      const window = getContextWindow(
        modelId,
        contextWindows,
        chatPrefs.contextWindow !== undefined
          ? chatPrefs.contextWindow
          : getScopedSettings(projectRoot).kodeContextWindow,
        getModelName(modelId),
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
        contextBudget: window,
        // Changing the mode in the picker applies from the next step.
        getMode: () => (liveModes.get(runKey) as KodeAgentMode | undefined) ?? activeMode,
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
                  modelProvider: (id) => kodeModels.find((m) => m.id === id)?.provider,
                },
                parentChatId: chatId,
              }),
            ]
          : [],
        reasoningEnabled: sendReasoningEnabled ?? reasoningEnabled,
        reasoningEffort: chatReasoning === "off" ? undefined : chatReasoning,
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

      // The user's message was saved when the turn started; save it now only
      // if that failed.
      if (!userMessageId) {
        await addMessageRecord({ chatId, role: "user", content: displayText, model: modelId });
      }
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
      if (response.usage) recordChatContextUsage(finishedId, response.usage);
      clearInterruptedTurn(runKey);
      // Convex now renders the persisted turns (with sources/todos).
      dropRunItems(runKey);
    } catch (error) {
      flushStream();
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

      // Save what this turn did before it failed, so the chat keeps it: the
      // bubbles used to exist only on screen and were gone after a restart,
      // and the next "continue" had no record of the work. Usage limits keep
      // their card (it can schedule the retry) and are not saved here.
      if (!limit && chatId && runKey !== DRAFT_KEY) {
        const live = pendingSlot.get()[runKey] ?? [];
        const reply = live.find((item) => item.id === thinkingMessage.id);
        const todos = reply?.toolTodos ?? [];
        try {
          if (!userMessageId) await addMessageRecord({ chatId, role: "user", content: displayText, model: modelId });
          await addMessageRecord({
            chatId,
            role: "assistant",
            content: withSteps(
              interruptedReply(reply?.content ?? "", cleanLimitMarker(message), todos),
              [...turnSteps.values()],
            ),
            model: modelId,
            todos: todos.length > 0 ? todos : undefined,
          });
          clearInterruptedTurn(runKey);
          dropRunItems(runKey);
          notifyRunEvent({ chatId: runKey, kind: "failed", detail: cleanLimitMarker(message).slice(0, 140) });
          return;
        } catch {
          // Couldn't save (offline?): keep the turn on screen as before.
        }
      }

      // A usage limit leaves the turn unanswered: take back the saved message
      // so the card's "send when it resets" doesn't show it twice.
      if (limit && userMessageId) {
        try {
          await rewindAfter(userMessageId);
        } catch {
          // Leave it saved; the retry will just repeat it.
        }
      }
      setPendingByChat((current) => ({
        ...current,
        [runKey]: (current[runKey] ?? []).map((item) =>
          item.id === userMessage.id && limit
            ? { ...item, saved: false }
            : item.id === thinkingMessage.id
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

      // Settings → General → Auto-resume limited threads: queue the prompt for
      // the reset time instead of waiting for a click on the limit card.
      const settingsNow = getSettings();
      if (
        limit &&
        settingsNow.autoResumeLimited &&
        limit.resetAt &&
        limit.resetAt > Date.now() &&
        runKey !== DRAFT_KEY
      ) {
        schedulePrompt({
          chatId: runKey,
          chatTitle: chats.find((chat) => chat.id === runKey)?.title ?? null,
          text,
          modelId,
          mode: activeMode,
          attachments,
          fireAt: limit.resetAt + RESET_BUFFER_MS,
          reason: "limit",
        });
        dropRunItems(runKey);
        setScheduleNow(Date.now());
      }
      notifyRunEvent({ chatId: runKey === DRAFT_KEY ? null : runKey, kind: limit ? "limit" : "failed", detail: cleanLimitMarker(message).slice(0, 140) });
    } finally {
      // The turn is saved (or kept on screen): drop its checkpoint.
      clearCheckpoint(runKey);
      setSendingChats((current) => ({ ...current, [runKey]: false }));
      setCompactingChats((current) => ({ ...current, [runKey]: false }));
      abortByChat.current.delete(runKey);
      abortByChat.current.delete(key);
      runtime.clearChat(runKey);
    }
  };

  return submitPrompt;
}
