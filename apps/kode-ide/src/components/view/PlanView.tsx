import {
  canUseKodeModel,
  KODE_DEFAULT_MODEL_ID,
  KODE_MODELS,
  type KodePlanTier,
} from "@repo/ai/lib/kode";
import { useQuery } from "convex/react";
import { Check, Copy, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/convex-api";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
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
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import type { KodeContentPart } from "@/lib/kode-chat";
import { ToolStepView } from "@/components/chat/ToolStep";
import { TodoList } from "@/components/chat/TodoList";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import type { DocSourceRef } from "@/lib/kode-docs";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { runKodeAgent, type KodeToolStep } from "@/lib/kode-agent";
import { useKodeAgentRuntime } from "@/lib/kode-agent-runtime";
import type { KodeAgentMode, KodeTodo } from "@/lib/kode-tools";
import {
  loadContextWindows,
  getContextWindow,
  type ContextWindows,
} from "@/lib/kode-context";
import {
  compactHistory,
  estimateTokens,
  needsCompaction,
  type CompactionState,
} from "@/lib/kode-compact";
import {
  useKodeWorkspace,
  type KodeWorkspaceMessage,
} from "@/lib/kode-workspace";

const suggestions = [
  "Build a Tauri command palette",
  "Fix the file tree drag state",
  "Create a Monaco editor theme",
];

type ChatMessage = KodeWorkspaceMessage & {
  // Ephemeral agent tool steps (live during a run, not persisted).
  toolSteps?: KodeToolStep[];
  // Plan/todos and docs sources — now persisted in Convex message metadata.
  toolTodos?: KodeTodo[];
  sources?: DocSourceRef[];
};

// Key for an in-flight send started on the home page before a chat exists.
const DRAFT_KEY = "draft";

// Approximate tokens the IDE adds to every request on top of the visible messages
// (identity + agent guidance + per-request skills/docs/repo context). Folded into
// the context meter so a fresh chat isn't reported as 0% when the model already
// sees the system prompt.
const KODE_SYSTEM_PROMPT_TOKENS = 1200;

const getModelName = (modelId: string) =>
  KODE_MODELS.find((model) => model.id === modelId)?.name ?? "Kode 1.0";

const normalizePlanTier = (tier: string): KodePlanTier =>
  tier === "starter" || tier === "pro" ? tier : "free";

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

function MessageMeta({
  message,
  onRewind,
}: {
  message: ChatMessage;
  onRewind?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Optimistic (not-yet-persisted) messages use temp ids; rewind needs a real id.
  const isPersisted =
    !message.id.startsWith("user-") && !message.id.startsWith("assistant-");

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

  return (
    <MessageActions className="-mt-0.5 w-fit px-1 text-foreground/40 group-[.is-user]:ml-auto">
      <MessageAction
        tooltip="Copy"
        onClick={copy}
        className="size-7 text-foreground/40 hover:text-foreground"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </MessageAction>
      {onRewind && isPersisted ? (
        <MessageAction
          tooltip="Rewind"
          onClick={onRewind}
          className="size-7 text-foreground/40 hover:text-foreground"
        >
          <RotateCcw size={13} />
        </MessageAction>
      ) : null}
      <span className="px-1 text-[11px] text-foreground/35">
        {formatRelativeTime(message.createdAt)}
      </span>
    </MessageActions>
  );
}

const PlanView = () => {
  const planTier = normalizePlanTier(usePlanTier());
  const [selectedModelId, setSelectedModelId] = useState(KODE_DEFAULT_MODEL_ID);
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
  const [seed, setSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  const [mode, setMode] = useState<KodeAgentMode>("ask");
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
    projects,
    chats,
    activeChatId,
    draftProjectId,
    createChatRecord,
    addMessageRecord,
    selectChat,
    rewindAfter,
  } = useKodeWorkspace();

  // Resolve the on-disk root of the active chat's (or draft's) project, if any.
  const activeProjectId =
    (activeChatId
      ? chats.find((chat) => chat.id === activeChatId)?.projectId
      : draftProjectId) ?? null;
  const projectRoot =
    projects.find((project) => project.id === activeProjectId)?.path ?? null;

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

  const convexMessages = useQuery(
    api.kode.getMessages,
    activeChatId ? { chatId: activeChatId } : "skip",
  );

  // General token budget for the signed-in user (daily + weekly). Used to block a
  // turn before it runs when the budget is exhausted.
  const kodeUsage = useQuery(api.kode.getUsage, {});

  const persistedMessages: ChatMessage[] = (convexMessages ?? [])
    .filter((message) => message.role !== "system")
    .map((message) => {
      const meta = message.metadata as
        | { model?: string; todos?: KodeTodo[]; sources?: DocSourceRef[] }
        | undefined;
      return {
        id: message._id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        modelId: meta?.model ?? selectedModelId,
        createdAt: message.createdAt,
        status: "complete",
        toolTodos: meta?.todos,
        sources: meta?.sources,
      } satisfies ChatMessage;
    });

  const currentKey = activeChatId ?? DRAFT_KEY;
  const overlay = pendingByChat[currentKey] ?? [];
  const messages: ChatMessage[] = [...persistedMessages, ...overlay];
  const isCurrentSending = !!sendingChats[currentKey];
  const isCompacting = !!compactingChats[currentKey];
  const latestUsage = usageByChat[currentKey];
  const messagesLoading =
    activeChatId !== null && convexMessages === undefined;

  const submitPrompt = async (
    text: string,
    modelId = selectedModelId,
    attachments?: StagedAttachment[],
  ) => {
    const key = activeChatId ?? DRAFT_KEY;
    if (sendingChats[key]) return;

    // Build what the model receives vs what we display/persist. The model gets
    // full file text + images (multimodal); the bubble shows a compact note.
    const imageAtts = (attachments ?? []).filter(
      (a) => a.mediaType.startsWith("image/") && a.url,
    );
    const fileAtts = (attachments ?? []).filter((a) => a.text);
    const fileBlocks = fileAtts
      .map((a) => `\n\n[Attached file: ${a.filename}]\n\`\`\`\n${a.text}\n\`\`\``)
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

    if (!canUseKodeModel(modelId, planTier)) {
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

    // Token-budget enforcement: block the turn before it runs if the user's general
    // budget is already exhausted for this day or week. We can't know the turn's
    // cost up front, so we gate on "already at/over the limit".
    if (kodeUsage) {
      const overWeekly = kodeUsage.weekly.used >= kodeUsage.weekly.limit;
      const overDaily = kodeUsage.daily.used >= kodeUsage.daily.limit;
      if (overWeekly || overDaily) {
        const win = overWeekly ? kodeUsage.weekly : kodeUsage.daily;
        const resetLabel = overWeekly
          ? new Date(win.resetAt).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })
          : new Date(win.resetAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
        const upgradeHint =
          planTier === "pro" ? "" : " Upgrade your plan for a higher limit.";
        setPendingByChat((current) => ({
          ...current,
          [key]: [
            userMessage,
            {
              id: `assistant-${now}`,
              role: "assistant",
              content: `You've reached your ${overWeekly ? "weekly" : "daily"} usage limit. It resets ${resetLabel}.${upgradeHint}`,
              modelId,
              status: "error",
            },
          ],
        }));
        return;
      }
    }

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
    const history = persistedMessages.reduce<
      { role: "user" | "assistant"; content: string }[]
    >((items, message) => {
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

      // Auto-compaction: if the conversation is near the model's window, summarize
      // older turns and send [summary, ...recent] instead. Original messages stay.
      // Surface a "Compacting context…" indicator only when it will actually run
      // (summarizing a large history can take a moment).
      const window = getContextWindow(modelId, contextWindows);
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
        modelId,
        history: sentHistory,
        userText: modelText,
        userContent,
        mode,
        projectRoot,
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
      setUsageByChat((current) => ({ ...current, [finishedId]: response.usage }));
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
  const persistedEstimate = estimateTokens(messages) + KODE_SYSTEM_PROMPT_TOKENS;
  const usedTokens = Math.max(persistedEstimate, latestUsage?.totalTokens ?? 0);
  const contextWindow = getContextWindow(selectedModelId, contextWindows);
  const inChat = activeChatId !== null || messages.length > 0;
  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-6 pb-5">
      <div
        className={
          inChat
            ? "mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col pt-20"
            : "mx-auto flex w-full max-w-4xl flex-1 flex-col items-center pt-[15vh]"
        }
      >
        {!inChat ? (
          <div className="mb-9 text-center">
            <div className="surface-inset mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase text-foreground/50">
              <span className="size-1.5 rounded-full bg-brand" />
              Agent
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground">
              What are we working on?
            </h1>
            <p className="mt-3 text-[17px] text-foreground/55">
              Ask the agent to build, edit, debug, explain, or review code.
            </p>
          </div>
        ) : messages.length === 0 && messagesLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground/35" />
          </div>
        ) : (
          <Conversation className="min-h-0 flex-1 overflow-hidden">
            <ConversationContent className="gap-6 px-0 pt-0 pb-5">
              {messages.map((message) => (
                <Message from={message.role} key={message.id}>
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
                            <ChainOfThought defaultOpen={Boolean(reasoningText)}>
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
                    ) : (
                      <MessageResponse>{message.content}</MessageResponse>
                    )}
                  </MessageContent>
                  <MessageMeta
                    message={message}
                    onRewind={
                      message.role === "user"
                        ? () => rewindMessage(message.id, message.content)
                        : undefined
                    }
                  />
                </Message>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        <div className="w-full">
          <ChatInput
            loading={isCurrentSending}
            onStop={stopCurrentRun}
            modelId={selectedModelId}
            onModelChange={setSelectedModelId}
            onSend={submitPrompt}
            mode={mode}
            onModeChange={setMode}
            seedText={seed.text}
            seedNonce={seed.nonce}
            placeholder={
              isCurrentSending
                ? "Kode is responding..."
                : "Ask the agent to work on your app..."
            }
            planTier={planTier}
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

          <div className="mt-2 flex items-center justify-end gap-2">
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
            <Context
              maxTokens={contextWindow}
              modelId={selectedModelId}
              usage={latestUsage}
              usedTokens={usedTokens}
            >
              <ContextTrigger className="h-7 gap-1.5 rounded-lg px-2 text-[12px] text-foreground/45 hover:bg-white/[0.05] hover:text-foreground/70" />
              <ContextContent className="border-white/[0.08] bg-[oklch(0.17_0.004_260)] text-foreground">
                <ContextContentHeader />
                <ContextContentBody className="space-y-2">
                  <ContextInputUsage />
                  <ContextOutputUsage />
                  <ContextReasoningUsage />
                </ContextContentBody>
              </ContextContent>
            </Context>
          </div>
        </div>

        {!inChat ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                className="surface-inset rounded-full px-3.5 py-1.5 text-[12.5px] text-foreground/58 transition-all duration-200 hover:-translate-y-px hover:text-foreground"
                key={suggestion}
                onClick={() => submitPrompt(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PlanView;
