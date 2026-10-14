import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Copy, Check, Pencil, RefreshCw, Brain, ChevronRight } from "lucide-react";
import { HiSpeakerWave } from "react-icons/hi2";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

function useTextToSpeech(content: string) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speechText = useMemo(() => {
    if (!content) return "";
    return content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/#+\s/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }, [content]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeak = useCallback(() => {
    if (typeof window === "undefined" || !speechText || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    synth.speak(utterance);
  }, [speechText]);

  return { isSpeaking, speechText, handleSpeak };
}

function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
  createdAt?: number;
  images?: string[];
}

export function ChatMessage({
  role,
  content,
  reasoning,
  isStreaming,
  onRetry,
  onEdit,
  createdAt,
  images,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { isSpeaking, speechText, handleSpeak } = useTextToSpeech(content);

  const isUser = role === "user";
  const timeStr = formatMessageTime(createdAt);

  useEffect(() => {
    if (isStreaming && reasoning && !content) {
      if (!timerRef.current) {
        const start = Date.now();
        setThinkingSeconds(1);
        timerRef.current = window.setInterval(() => {
          setThinkingSeconds(Math.max(1, Math.floor((Date.now() - start) / 1000)));
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isStreaming, reasoning, content]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = () => {
    setDraft(content);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    const next = draft.trim();
    if (!next || next === content.trim()) {
      setIsEditing(false);
      return;
    }
    onEdit?.(next);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [isEditing]);

  if (role === "system") return null;

  return (
    <div className={cn("py-2.5", isUser ? "flex justify-end" : "flex justify-start")}>
      <div className={cn("group max-w-[92%] sm:max-w-[85%]", isUser ? "ml-auto w-fit" : "w-full max-w-full")}>
        {/* Content Container */}
        {isUser ? (
          <div className="flex flex-col items-end gap-1.5">
            {/* Image attachments preview if any */}
            {images && images.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2 mb-1">
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-xl border border-purple-500/20 bg-black/40 shadow-sm"
                  >
                    <img
                      src={src}
                      alt="Attachment"
                      className="max-h-40 max-w-64 object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            {isEditing && onEdit ? (
              <div className="w-full min-w-[280px] sm:min-w-[420px] rounded-2xl bg-card p-3 shadow-md border border-purple-500/25">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      saveEdit();
                    }
                  }}
                  rows={1}
                  className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="Edit your message..."
                />
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-500/20">
                  <span className="mr-auto text-[10px] text-muted-foreground font-mono">
                    ⌘↵ to save · esc to cancel
                  </span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={!draft.trim() || draft.trim() === content.trim()}
                    className="inline-flex items-center justify-center rounded-lg px-3 py-1 text-xs font-semibold bg-purple-600 text-white hover:bg-purple-500 transition-all disabled:opacity-40 cursor-pointer shadow-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-purple-500/10 dark:bg-[#241738] text-purple-950 dark:text-white/95 border border-purple-300/40 dark:border-purple-500/20 shadow-[0_2px_12px_rgba(147,51,234,0.08),inset_0_1px_1px_rgba(255,255,255,0.95)] backdrop-blur-md px-4 py-2.5 text-[13.5px] leading-relaxed">
                <div className="whitespace-pre-wrap">{content}</div>
              </div>
            )}

            {/* Subtle Time & Actions beneath user bubble */}
            {!isEditing && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 pr-1">
                {timeStr && <span>{timeStr}</span>}
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-purple-600 dark:text-purple-400" /> : <Copy size={12} />}
                </button>
                {onEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    title="Edit"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Assistant: Sits cleanly directly on page */
          <div className="w-full py-1 text-foreground">
            {reasoning && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setIsReasoningOpen(!isReasoningOpen)}
                  className="liquid-glass-pill rounded-full inline-flex items-center gap-1.5 px-3 py-1 text-xs text-purple-700 dark:text-purple-300 transition-colors cursor-pointer group"
                >
                  <Brain
                    size={13}
                    className={cn(
                      "text-purple-600 dark:text-purple-400 transition-all",
                      isStreaming && !content && "animate-pulse text-purple-600 dark:text-purple-300"
                    )}
                  />
                  <span>
                    {isStreaming && !content
                      ? `Thinking (${thinkingSeconds}s)...`
                      : `Thought for ${thinkingSeconds > 0 ? `${thinkingSeconds}s` : "a few seconds"}`}
                  </span>
                  <ChevronRight
                    size={12}
                    className={cn(
                      "transition-transform duration-200 text-purple-600/50 dark:text-purple-300/40 group-hover:text-purple-800 dark:group-hover:text-purple-300",
                      isReasoningOpen && "rotate-90"
                    )}
                  />
                </button>
                {isReasoningOpen && (
                  <div className="mt-2 mb-2 p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-800/30 text-xs text-purple-950 dark:text-purple-200/85 whitespace-pre-wrap leading-relaxed backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
                    {reasoning}
                  </div>
                )}
              </div>
            )}

            <div className="prose max-w-none break-words text-foreground dark:prose-invert text-[14.5px] leading-relaxed">
              <MessageResponse>{content}</MessageResponse>
            </div>

            {/* Bottom Actions below Assistant Message */}
            {!isStreaming && (
              <div className="mt-3 flex items-center gap-1 text-muted-foreground">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-purple-600 dark:text-purple-400" /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!speechText}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors cursor-pointer",
                    isSpeaking ? "bg-purple-500/20 text-purple-700 dark:text-purple-300" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    !speechText && "opacity-30 cursor-not-allowed hover:bg-transparent"
                  )}
                  title={isSpeaking ? "Stop reading" : "Read aloud"}
                >
                  <HiSpeakerWave size={13} />
                  <span>{isSpeaking ? "Stop" : "Speak"}</span>
                </button>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    title="Retry response"
                  >
                    <RefreshCw size={11} />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
