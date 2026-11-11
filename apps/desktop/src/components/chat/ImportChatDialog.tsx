// Paste a shared ChatGPT / Claude / Gemini / … link and continue it here.
// The chat opens right away and fills in as the import runs.

import { useAction, useMutation } from "convex/react";
import { Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/settings/settings-ui";
import { Dialog, DialogBody, DialogContent, DialogFooter, fieldClassName } from "@/components/ui/dialog";
import { api } from "@/lib/convex-api";
import { checkShareUrl, PROVIDER_LABEL, providerFor, startSharedImport } from "@/lib/home-import";

export function ImportChatDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new chat exists: open it. */
  onStarted: (chatId: string) => void;
}) {
  const createChat = useMutation(api.chats.createChat);
  const appendImported = useMutation(api.chats.appendImportedMessagesToChat);
  const appendFailure = useMutation(api.chats.appendImportFailureMessageToChat);
  const importViaFirecrawl = useAction(api.firecrawl.importIntoChat);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checked = value.trim() ? checkShareUrl(value) : null;
  const provider = checked && "url" in checked ? providerFor(checked.url) : null;
  const providerName = provider ? (PROVIDER_LABEL[provider] ?? null) : null;

  const submit = async () => {
    const result = checkShareUrl(value);
    if ("error" in result) {
      setProblem(result.error);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const { chatId } = await startSharedImport(result.url, {
        createChat,
        importViaFirecrawl,
        appendImported,
        appendFailure,
      });
      setValue("");
      onOpenChange(false);
      onStarted(chatId);
    } catch (error) {
      const data = (error as { data?: { message?: string } } | null)?.data;
      setProblem(data?.message ?? (error instanceof Error ? error.message : "The import couldn't start."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setProblem(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        eyebrow="Import"
        title="Continue a shared chat"
        description="Paste a shared link from ChatGPT, Claude, Gemini, Grok, Perplexity or DeepSeek. The chat opens here and fills in as it imports."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogBody className="pb-4">
            <div className="relative">
              <Link2 size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <input
                // biome-ignore lint/a11y/noAutofocus: the dialog exists to take this link
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setProblem(null);
                }}
                aria-label="Shared chat link"
                placeholder="https://chatgpt.com/share/…"
                className={fieldClassName("h-9 pl-8")}
              />
            </div>
            <p className="mt-2 min-h-4 px-1 text-label text-muted-foreground" aria-live="polite">
              {problem ? (
                <span style={{ color: "var(--status-danger)" }}>{problem}</span>
              ) : providerName ? (
                `From ${providerName}`
              ) : null}
            </p>
          </DialogBody>
          <DialogFooter>
            <PillButton onClick={() => onOpenChange(false)}>Cancel</PillButton>
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="kontinue-3d-primary flex h-8 items-center gap-1.5 rounded-full px-3.5 text-label font-medium disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}
              Import chat
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shown in a chat while its import is still running. */
export function ImportProgress({ percent, stage }: { percent: number; stage: string }) {
  return (
    <div role="status" className="mx-auto mt-10 w-full max-w-md text-center">
      <Loader2 size={18} className="mx-auto mb-3 animate-spin text-brand" />
      <p className="text-body font-medium">Importing this chat</p>
      <p className="mt-1 text-label text-muted-foreground">{stage}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-500" style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
