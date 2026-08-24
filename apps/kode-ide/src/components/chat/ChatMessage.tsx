import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Copy, Check, Pencil, RefreshCw } from "lucide-react";
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

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  onRetry?: () => void;
  onEdit?: (newContent: string) => void;
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  onRetry,
  onEdit,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { isSpeaking, speechText, handleSpeak } = useTextToSpeech(content);

  const isUser = role === "user";

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
      <div className={cn("group max-w-[92%] sm:max-w-[88%]", isUser ? "ml-auto w-fit" : "w-full max-w-full")}>
        {/* Bubble */}
        <div
          className={cn(
            "rounded-[22px] transition-shadow",
            isUser
              ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))] border border-white/[0.12] text-foreground shadow-sm px-4 py-3"
              : "bg-card/60 border border-white/[0.08] backdrop-blur-sm text-foreground/90 shadow-sm px-5 py-4",
            isEditing && "w-full min-w-[280px] sm:min-w-[420px]"
          )}
        >
          {isEditing && onEdit ? (
            <div className="flex flex-col gap-2">
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
                className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
                placeholder="Edit your message..."
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <span className="mr-auto text-[10.5px] text-muted-foreground/60 font-mono">
                  ⌘↵ to save · esc to cancel
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full px-3 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={!draft.trim() || draft.trim() === content.trim()}
                  className="inline-flex items-center justify-center rounded-full px-3.5 py-1.5 text-[12px] font-semibold bg-white text-black hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save & regenerate
                </button>
              </div>
            </div>
          ) : (
            <div className="prose max-w-none break-words dark:prose-invert">
              {isUser ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>
              ) : (
                <MessageResponse>{content}</MessageResponse>
              )}
            </div>
          )}
        </div>

        {/* Actions bar below bubble */}
        {!isStreaming && !isEditing && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 transition-opacity duration-150",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-all hover:bg-white/[0.08] hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Edit Button for User */}
            {isUser && onEdit && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-all hover:bg-white/[0.08] hover:text-foreground"
              >
                <Pencil size={11} />
                <span>Edit</span>
              </button>
            )}

            {/* Speak & Retry Buttons for Assistant */}
            {!isUser && (
              <>
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!speechText}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all",
                    isSpeaking
                      ? "bg-brand/20 text-brand"
                      : "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    !speechText && "opacity-40 cursor-not-allowed hover:bg-transparent"
                  )}
                  title={isSpeaking ? "Stop reading" : "Read aloud"}
                >
                  <HiSpeakerWave size={12} />
                  <span>{isSpeaking ? "Stop" : "Speak"}</span>
                </button>

                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-all hover:bg-white/[0.08] hover:text-foreground"
                    title="Retry response"
                  >
                    <RefreshCw size={11} />
                    <span>Retry</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
