import { useState } from "react";
import { Copy, Check, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  chatTitle: string;
}

export function ShareModal({
  isOpen,
  onClose,
  chatId,
  chatTitle,
}: ShareModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${chatId}`
      : `https://app.kontinue.ai/share/${chatId}`;

  const displayTitle = chatTitle.trim() || "Conversation";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSocialShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: displayTitle,
          url: shareUrl,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Share failed:", err);
      }
    }
  };

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/75 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="liquid-glass-dropdown relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-2xl text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="mb-5 space-y-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400">
            Share
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Share {displayTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            Anyone with this link can view this conversation.
          </p>
        </div>

        {/* Link & Actions */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 rounded-xl border border-purple-200/60 dark:border-border bg-white/70 dark:bg-secondary/50 px-3 py-2 font-mono text-xs text-foreground outline-none select-all focus:border-purple-500/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all shrink-0 cursor-pointer",
                copySuccess
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "bg-purple-600 text-white hover:bg-purple-500 shadow-[0_2px_10px_rgba(147,51,234,0.3)]"
              )}
            >
              {copySuccess ? (
                <>
                  <Check size={14} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          {canShare && (
            <button
              type="button"
              onClick={handleSocialShare}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 py-2 text-xs font-medium text-foreground transition-all hover:bg-secondary cursor-pointer"
            >
              <Share2 size={14} />
              <span>Share via...</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
