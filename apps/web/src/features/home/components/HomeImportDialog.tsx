"use client";

import { ArrowUpRight, Link2, Loader2 } from "lucide-react";
import { Provider, PROVIDER_CONFIG } from "@repo/utils/url-safety";
import { cn } from "@repo/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";

type HomeImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importUrl: string;
  onImportUrlChange: (value: string) => void;
  importProvider: Provider;
  isImporting: boolean;
  onImport: () => void;
};

export function HomeImportDialog({
  open,
  onOpenChange,
  importUrl,
  onImportUrlChange,
  importProvider,
  isImporting,
  onImport,
}: HomeImportDialogProps) {
  const providerDetected = importProvider !== "unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-foreground",
            "bg-linear-to-br from-primary/18 to-primary/8 ring-1 ring-primary/25",
            "shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--primary)_35%,transparent),0_0_28px_-10px_color-mix(in_oklch,var(--primary)_60%,transparent),inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]",
            "transition-all duration-200",
            "hover:from-primary/24 hover:to-primary/12 hover:scale-[1.025]",
            "hover:shadow-[0_4px_14px_-2px_color-mix(in_oklch,var(--primary)_45%,transparent),0_0_36px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent),inset_0_1px_0_color-mix(in_oklch,var(--foreground)_10%,transparent)]",
            "active:scale-[0.98]"
          )}
        >
          <ArrowUpRight className="h-4 w-4 text-primary transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          Import shared link
        </button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          "glass-strong rounded-2xl p-0 max-w-md border-foreground/10 overflow-hidden gap-0",
          // close pill — same recipe
          "[&>button[data-slot=dialog-close]]:z-50",
          "[&>button[data-slot=dialog-close]]:top-4 [&>button[data-slot=dialog-close]]:right-4",
          "[&>button[data-slot=dialog-close]]:size-8 [&>button[data-slot=dialog-close]]:rounded-full",
          "[&>button[data-slot=dialog-close]]:bg-foreground/5 [&>button[data-slot=dialog-close]]:border [&>button[data-slot=dialog-close]]:border-foreground/8",
          "[&>button[data-slot=dialog-close]]:text-muted-foreground",
          "[&>button[data-slot=dialog-close]]:transition-all [&>button[data-slot=dialog-close]]:duration-200",
          "[&>button[data-slot=dialog-close]]:hover:bg-foreground/10 [&>button[data-slot=dialog-close]]:hover:text-foreground [&>button[data-slot=dialog-close]]:hover:scale-105",
          "[&>button[data-slot=dialog-close]>svg]:size-4"
        )}
      >
        {/* Accent bar */}
        <div className="h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

        <div className="px-7 pt-7 pb-7">
          {/* Header */}
          <div className="mb-6">
            <span className="eyebrow">Import</span>
            <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Continue a conversation
            </DialogTitle>
            <p className="mt-2 text-[13px] text-muted-foreground/85 leading-relaxed">
              Paste a shared link from ChatGPT, Claude, Gemini, or any supported
              provider. We'll bring the messages into Kontinue.
            </p>
          </div>

          {/* URL input */}
          <div className="space-y-3">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <input
                type="url"
                value={importUrl}
                onChange={(event) => onImportUrlChange(event.target.value)}
                placeholder="https://chat.openai.com/share/..."
                className={cn(
                  "w-full rounded-xl py-2.5 pl-10 pr-3 text-[14px] text-foreground outline-none transition-all duration-200",
                  "surface-inset placeholder:text-muted-foreground/60",
                  "focus:bg-foreground/6 focus:ring-2 focus:ring-primary/30 focus:border-primary/30"
                )}
                autoFocus
              />
            </div>

            {/* Detected provider */}
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-[10px]">Detected provider</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all duration-200",
                  providerDetected
                    ? "bg-foreground/5 ring-1 ring-foreground/8 text-foreground"
                    : "bg-foreground/3 ring-1 ring-foreground/5 text-muted-foreground"
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full transition-shadow duration-200"
                  style={{
                    backgroundColor: PROVIDER_CONFIG[importProvider].color,
                    boxShadow: providerDetected
                      ? `0 0 8px 0 ${PROVIDER_CONFIG[importProvider].color}`
                      : undefined,
                  }}
                />
                {PROVIDER_CONFIG[importProvider].name}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-7 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onImport}
              disabled={isImporting || !importUrl.trim()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all duration-200",
                "bg-primary text-primary-foreground",
                "shadow-[0_4px_14px_-4px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
                "hover:scale-105 hover:bg-primary/95",
                "hover:shadow-[0_6px_20px_-4px_color-mix(in_oklch,var(--primary)_65%,transparent)]",
                "active:scale-95",
                "disabled:opacity-50 disabled:scale-100 disabled:shadow-none disabled:cursor-not-allowed"
              )}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import chat"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
