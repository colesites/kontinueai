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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-card/95 p-6 shadow-2xl backdrop-blur-xl text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.08]"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="mb-5 space-y-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-brand">
            Share
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-white">
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
              className="flex-1 rounded-xl border border-white/[0.1] bg-black/40 px-3 py-2 font-mono text-xs text-foreground outline-none select-all focus:border-brand/50"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all shrink-0",
                copySuccess
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-white text-black hover:bg-white/90 shadow-sm"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] py-2 text-xs font-medium text-foreground transition-all hover:bg-white/[0.08]"
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
