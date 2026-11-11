import { useUser } from "@clerk/clerk-react";
import { AVAILABLE_MODELS, getDefaultModel, type ModelOption } from "@repo/ai/lib/models";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Brain, ChevronDown, Copy, HelpCircle, MessageSquare, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuShare } from "react-icons/lu";
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { type ChatTurn, DesktopChatTurnNavigator } from "@/components/chat/DesktopChatTurnNavigator";
import { ScrollJumpControls } from "@/components/chat/ScrollJumpControls";
import { ShareModal } from "@/components/chat/ShareModal";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { PillButton } from "@/components/settings/settings-ui";
import { ImportChatDialog, ImportProgress } from "@/components/chat/ImportChatDialog";
import { importProgressFromTitle } from "@/lib/home-import";
import { Dialog, DialogBody, DialogContent, DialogFooter, fieldClassName } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsFullscreen } from "@/hooks/use-is-fullscreen";
import { useAppSettings } from "@/lib/app-settings";
import { api } from "@/lib/convex-api";
import { attachmentContent } from "@/lib/kode-attachments";
import { type KodeChatMessage, type KodeContentPart, sendKodeChat } from "@/lib/kode-chat";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { createDeltaBatcher, createRunSlot, useRunSlot } from "@/lib/kode-run-state";
import { useReasoningPreference } from "@/lib/use-reasoning-preference";
import { cn } from "@/lib/utils";

const DESKTOP_MODELS: ModelOption[] = AVAILABLE_MODELS.filter((m) => {
  if (m.modality === "realtime") return false;
  const lower = m.id.toLowerCase();
  return !lower.includes("realtime") && !lower.includes("-live") && !lower.endsWith("/live");
});

function renderMessageContent(content: string | KodeContentPart[] | null): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content.map((part) => (part.type === "text" && "text" in part ? part.text : "")).join("\n");
}

/* ── How it works ── */
function HowItWorksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const steps = [
    {
      title: "Ask anything",
      desc: "Type below and a new conversation opens. Pick the model next to the message box.",
    },
    {
      title: "Bring chats with you",
      desc: "Use Import shared link to paste a ChatGPT, Claude or Gemini share link and pick up where it left off.",
    },
    {
      title: "Keep going anywhere",
      desc: "Chats, projects and tasks sync across desktop, web and mobile with full context.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="How Kontinue works" eyebrow="Get started">
        <DialogBody>
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-purple-500/20 bg-purple-500/10 text-label font-semibold tabular-nums text-purple-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] dark:bg-purple-500/15 dark:text-purple-300">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{step.title}</p>
                  <p className="mt-0.5 text-label leading-relaxed text-zinc-500 dark:text-zinc-400">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// Home replies in flight, by chat (see kode-run-state.ts).
const homeRunsSlot = createRunSlot<Record<string, { content: string; reasoning?: string }>>({});

const STARTER_PROMPTS: { icon: string; title: string; prompt: string }[] = [
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
    icon: "🔭",
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
  const isFullscreen = useIsFullscreen();
  const { chats, activeChatId, selectChat, createChatRecord, addMessageRecord, togglePinChat, deleteChat, renameChat, openSettings } = useKodeWorkspace();
  const { user } = useUser();

  const firstName = user?.firstName || user?.fullName || "there";

  const [selectedModel, setSelectedModel] = useState<ModelOption>(() => {
    return DESKTOP_MODELS.find((m) => m.isDefault) ?? DESKTOP_MODELS[0] ?? getDefaultModel();
  });
  const { reasoningEnabled, setReasoningEnabled } = useReasoningPreference();
  // Replies still streaming, by chat. Kept outside the component so leaving
  // Home and coming back still shows them, and a reply never shows up under
  // another chat you switched to.
  const [homeRuns, setHomeRuns] = useRunSlot(homeRunsSlot);
  const inFlightAssistant = activeChatId ? (homeRuns[activeChatId] ?? null) : null;
  const streaming = inFlightAssistant !== null;
  const [streamingElapsed, setStreamingElapsed] = useState(0);
  const streamingTimerRef = useRef<number | null>(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const [showScrollToTopButton, setShowScrollToTopButton] = useState(false);
  const [composerSeed, setComposerSeed] = useState({ text: "", nonce: 0 });
  const deleteMessagesAfter = useMutation(api.messages.deleteMessagesAfter);
  const createForkedChat = useMutation(api.chats.createChat);
  const [importOpen, setImportOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = useMemo(() => {
    return chats.find((c) => c.id === activeChatId) ?? null;
  }, [chats, activeChatId]);
  // A shared-link import still running in this chat (progress is in its title).
  const importing = importProgressFromTitle(activeChat?.title);

  const isHomeChat = Boolean(activeChatId && chats.some((c) => c.id === activeChatId));

  const dbMessages = useQuery(api.messages.getMessages, isHomeChat && activeChatId ? { chatId: activeChatId } : "skip");

  const displayMessages = useMemo(() => {
    const db = (dbMessages ?? []).map((m) => ({
      id: m._id as string | undefined,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      createdAt: m.createdAt as number | undefined,
      reasoning: undefined as string | undefined,
    }));
    if (inFlightAssistant) {
      return [
        ...db,
        {
          id: undefined,
          role: "assistant" as const,
          content: inFlightAssistant.content,
          createdAt: undefined,
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
        const preview = text.length > 46 ? `${text.slice(0, 46).trimEnd()}...` : text || `Prompt ${result.length + 1}`;
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
    setShowScrollToTopButton(scrollTop > 400);
  }, []);

  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const { showTurnNavigator } = useAppSettings();

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleJumpToTurn = useCallback((turnId: string) => {
    const el = document.getElementById(turnId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (renameModalOpen) renameInputRef.current?.focus();
  }, [renameModalOpen]);

  const transcriptLength = displayMessages.reduce((sum, message) => sum + (typeof message.content === "string" ? message.content.length : 1), 0);

  useEffect(() => {
    if (transcriptLength < 0) return;
    scrollToBottom();
  }, [transcriptLength, scrollToBottom]);

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

  const handleSend = async (text: string, _modelId?: string, attachments?: StagedAttachment[], _webSearchEnabled?: boolean, sendReasoningEnabled?: boolean, historyOverride?: KodeChatMessage[]) => {
    const promptText = text.trim();
    if (!promptText || streaming) return;

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChatRecord({ title: promptText.slice(0, 50) });
      selectChat(chatId);
    }

    // Attachments: images go to the model as images, text files inline.
    const { content: userContent, note } = attachmentContent(promptText, attachments ?? []);
    const userMsg: KodeChatMessage = { role: "user", content: userContent };
    // Message payload sent to backend: prior messages in display plus new user prompt
    const messagesPayload: KodeChatMessage[] = [...(historyOverride ?? displayMessages), userMsg];

    const runChatId = chatId;
    const setRun = (next: { content: string; reasoning?: string } | null) =>
      setHomeRuns((current) => {
        const copy = { ...current };
        if (next) copy[runChatId] = next;
        else delete copy[runChatId];
        return copy;
      });
    setRun({ content: "", reasoning: "" });

    let assistantContent = "";
    let assistantReasoning = "";
    // Redraw at most every 50ms while streaming, not once per token.
    const redraw = createDeltaBatcher<"reply">(() =>
      setRun({ content: assistantContent, reasoning: assistantReasoning }),
    );
    try {
      // Persist user prompt to Convex DB
      await addMessageRecord({
        chatId,
        role: "user",
        content: note ? `${promptText}\n\n${note}` : promptText,
        model: selectedModel.id,
      });

      const reply = await sendKodeChat({
        // Through the Kontinue server: plan access + monthly request quota.
        kontinueServer: true,
        surface: "home",
        messages: messagesPayload,
        modelId: selectedModel.id,
        reasoningEnabled: sendReasoningEnabled ?? reasoningEnabled,
        onEvent: (evt) => {
          if (evt.type === "content") {
            assistantContent += evt.delta;
            redraw.push("reply", evt.delta);
          } else if (evt.type === "reasoning") {
            assistantReasoning += evt.delta;
            redraw.push("reply", evt.delta);
          }
        },
      });

      // A reply that stopped early says so instead of ending mid-sentence.
      const finalText = reply.truncated
        ? `${assistantContent.trim()}\n\n> The reply was cut off before it finished. Ask me to continue.`
        : assistantContent;
      await addMessageRecord({
        chatId,
        role: "assistant",
        content: finalText.trim() ? finalText : reply.content,
        model: selectedModel.id,
      });
    } catch (err) {
      console.error("[HomeView] Error sending message:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Keep what had already arrived above the error.
      const partial = assistantContent.trim();
      try {
        await addMessageRecord({
          chatId,
          role: "assistant",
          content: `${partial ? `${partial}\n\n` : ""}> Couldn't finish the reply from ${selectedModel.name}: ${errorMsg}`,
          model: selectedModel.id,
        });
      } catch {
        // Offline: nothing more can be saved.
      }
    } finally {
      redraw.flush();
      setRun(null);
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

  const handleEdit = async (msgIndex: number, newContent: string, messageId?: string) => {
    if (streaming || !newContent.trim()) return;
    const history = displayMessages.slice(0, msgIndex).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    if (messageId) {
      await deleteMessagesAfter({ messageId, inclusive: true });
    }
    await handleSend(newContent.trim(), undefined, undefined, undefined, undefined, history);
  };

  const handleRewind = async (messageId: string, text: string) => {
    setComposerSeed((current) => ({ text, nonce: current.nonce + 1 }));
    await deleteMessagesAfter({ messageId, inclusive: true });
  };

  const handleFork = async (msgIndex: number) => {
    const slice = (dbMessages ?? []).slice(0, msgIndex + 1);
    if (slice.length === 0) return;
    const chatId = await createForkedChat({
      title: `${activeChat?.title ?? "Chat"} fork`,
      provider: "manual",
      importMethod: "manual",
      messages: slice.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });
    selectChat(chatId);
  };

  const isChatActive = Boolean(activeChatId) || displayMessages.length > 0;

  return (
    <div className="relative flex h-full w-full flex-col bg-transparent dark:bg-background text-foreground overflow-hidden">
      {/* Floating Desktop Chat Turn Navigator on the Right Side */}
      {isChatActive && showTurnNavigator && <DesktopChatTurnNavigator turns={turns} getScrollElement={getScrollElement} onJumpToTurn={handleJumpToTurn} />}

      {/* Top Header Bar when Sidebar is Collapsed */}
      {isCollapsed && <FloatingSidebarButtonGroup />}

      {/* Active Conversation View */}
      {isChatActive ? (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Seamless Header Bar with Conversation Title Dropdown & Share */}
          <div data-tauri-drag-region className={cn("relative z-20 flex h-13 shrink-0 items-center justify-between px-6", isCollapsed && (isFullscreen ? "pl-[120px]" : "pl-[214px]"))}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground/90 transition-all hover:bg-purple-500/10 hover:text-purple-700 dark:hover:text-white cursor-pointer group outline-none border border-transparent hover:border-purple-300/40">
                  <MessageSquare size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="truncate max-w-[280px] sm:max-w-[420px]">{activeChat?.title || (displayMessages[0] ? renderMessageContent(displayMessages[0].content).slice(0, 45) : "Chat")}</span>
                  <ChevronDown size={13} className="text-foreground/50 transition-transform group-hover:text-purple-600 dark:group-hover:text-white shrink-0" />
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

            <button type="button" onClick={() => setShareModalOpen(true)} className="kontinue-capsule flex size-8 items-center justify-center text-purple-900 dark:text-purple-100 transition-all cursor-pointer" title="Share chat">
              <LuShare size={16} />
            </button>
          </div>

          {/* Scrollable Messages Stream (Same max-w-3xl width as ChatInput) */}
          <div ref={scrollContainerRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto pt-2 pb-4 scroll-smooth">
            <div className="flex flex-col gap-4 px-4 pt-4 pb-6 max-w-3xl mx-auto w-full">
              {importing && displayMessages.length === 0 ? <ImportProgress {...importing} /> : null}
              {displayMessages.map((msg, i) => {
                const textContent = renderMessageContent(msg.content);
                const isUser = msg.role === "user";
                const imageParts = Array.isArray(msg.content)
                  ? (msg.content as KodeContentPart[])
                      .filter((p) => p.type === "image_url")
                      .map(
                        (p) =>
                          (
                            p as {
                              type: "image_url";
                              image_url: { url: string };
                            }
                          ).image_url.url,
                      )
                  : undefined;

                return (
                  <div key={msg.id ?? "live-reply"} id={`turn-${i}`}>
                    <ChatMessage
                      role={msg.role as "user" | "assistant" | "system"}
                      content={textContent}
                      reasoning={msg.reasoning}
                      createdAt={msg.createdAt}
                      images={imageParts}
                      isStreaming={streaming && i === displayMessages.length - 1 && !isUser}
                      onRetry={() => void handleRetry(i)}
                      onEdit={isUser ? (newContent) => void handleEdit(i, newContent, msg.id) : undefined}
                      onFork={() => void handleFork(i)}
                      onRewind={
                        isUser && msg.id
                          ? () => {
                              const messageId = msg.id;
                              if (messageId) void handleRewind(messageId, textContent);
                            }
                          : undefined
                      }
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
          <div className="shrink-0 p-6 dark:bg-gradient-to-t dark:from-background dark:via-background/85 dark:to-transparent z-20 relative">
            <ScrollJumpControls className="-top-5" showTop={showScrollToTopButton} showLatest={showScrollToBottomButton} onTop={scrollToTop} onLatest={scrollToBottom} />

            <div className="max-w-3xl mx-auto">
              <ChatInput
                loading={streaming}
                seedText={composerSeed.text}
                seedNonce={composerSeed.nonce}
                placeholder="Ask anything..."
                hideAgentMode
                models={DESKTOP_MODELS}
                modelId={selectedModel.id}
                onModelChange={(newId) => {
                  const found = DESKTOP_MODELS.find((m) => m.id === newId);
                  if (found) setSelectedModel(found);
                }}
                onOpenConnectors={() => openSettings("integrations")}
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
              <img src="/kontinueai.svg" alt="Kontinue AI" className="h-10 dark:invert-0 invert" />
            </div>

            {/* Personalized Greeting */}
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-zinc-900 dark:text-zinc-100">
              How can I help you, <span className="font-bold text-purple-600 dark:text-purple-400">{firstName}</span>?
            </h1>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setHowItWorksOpen(true)}
                className="liquid-glass-pill inline-flex h-8 items-center gap-1.5 px-3.5 text-label text-zinc-700 hover:text-purple-700 dark:text-zinc-200 dark:hover:text-white"
              >
                <HelpCircle size={13} className="shrink-0 text-brand" />
                <span>How does this work?</span>
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="liquid-glass-pill inline-flex h-8 items-center gap-1.5 px-3.5 text-label text-zinc-700 hover:text-purple-700 dark:text-zinc-200 dark:hover:text-white"
              >
                <ArrowUpRight size={13} className="shrink-0 text-brand" />
                <span>Import shared link</span>
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
                onOpenConnectors={() => openSettings("integrations")}
                reasoningEnabled={reasoningEnabled}
                onReasoningToggle={setReasoningEnabled}
                onSend={(text, _m, atts, _w, r) => void handleSend(text, selectedModel.id, atts, _w, r)}
              />
            </div>

            {/* Quick Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full pt-4 text-left">
              {STARTER_PROMPTS.map((starter) => (
                <button
                  key={starter.title}
                  type="button"
                  onClick={() => void handleSend(starter.prompt)}
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
          </div>
        </div>
      )}

      {/* Modals */}
      <ShareModal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} chatId={activeChatId || ""} chatTitle={activeChat?.title || "Conversation"} />
      <HowItWorksDialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
      <ImportChatDialog open={importOpen} onOpenChange={setImportOpen} onStarted={selectChat} />

      <Dialog open={renameModalOpen} onOpenChange={setRenameModalOpen}>
        <DialogContent title="Rename conversation" size="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (activeChatId && newTitle.trim()) {
                void renameChat(activeChatId, newTitle.trim());
                setRenameModalOpen(false);
              }
            }}
          >
            <DialogBody className="pb-4">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                ref={renameInputRef}
                aria-label="Conversation title"
                placeholder="Conversation title"
                className={fieldClassName("h-9")}
              />
            </DialogBody>
            <DialogFooter>
              <PillButton onClick={() => setRenameModalOpen(false)}>Cancel</PillButton>
              <button
                type="submit"
                disabled={!newTitle.trim()}
                className="kontinue-3d-primary flex h-8 items-center rounded-full px-3.5 text-label font-medium disabled:opacity-40"
              >
                Save
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
