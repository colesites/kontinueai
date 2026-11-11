import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { openExternal, PillButton } from "@/components/settings/settings-ui";
import { Dialog, DialogBody, DialogContent, fieldClassName } from "@/components/ui/dialog";
import { WEB_APP_URL } from "@/lib/desktop-auth";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  chatTitle: string;
}

export function ShareModal({ isOpen, onClose, chatId, chatTitle }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  // Shared conversations are served by the web app, never by this window's
  // own origin (tauri://localhost).
  const shareUrl = `${WEB_APP_URL}/share/${chatId}`;
  const displayTitle = chatTitle.trim() || "Conversation";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        eyebrow="Share"
        title={displayTitle}
        description="Anyone with this link can read this conversation."
      >
        <DialogBody>
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className={fieldClassName("h-8 min-w-0 flex-1 rounded-full font-mono text-label")}
            />
            <PillButton tone="primary" onClick={() => void copy()}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy link"}
            </PillButton>
          </div>
          <div className="mt-3 flex justify-end">
            <PillButton onClick={() => openExternal(shareUrl)}>
              <ExternalLink size={13} />
              Open in browser
            </PillButton>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
