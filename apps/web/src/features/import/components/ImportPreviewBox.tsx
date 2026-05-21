"use client";

import { useImportStore } from "../lib/useImportStore";
import { cn } from "@repo/ui/lib/utils";
import { PROVIDER_CONFIG } from "@repo/utils/url-safety";
import { Scan, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { ScanningAnimation, ScanningSkeleton } from "./ScanningAnimation";
import { PreviewMessageList } from "./PreviewMessageList";

export function ImportPreviewBox() {
  const { status, provider, preview, error } = useImportStore();

  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300",
        status === "scanning" && "border-primary/50 pulse-glow",
        status === "previewing" && "border-green-500/50",
        status === "error" && "border-destructive/50",
        status === "importing" && "border-primary/50",
        status === "success" && "border-green-500/50"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "px-4 py-3 flex items-center gap-3",
          status === "scanning" && "bg-primary/10",
          status === "previewing" && "bg-green-500/10",
          status === "error" && "bg-destructive/10",
          status === "importing" && "bg-primary/10",
          status === "success" && "bg-green-500/10"
        )}
      >
        {status === "scanning" && (
          <>
            <div className="relative">
              <Scan className="text-primary animate-pulse" size={20} />
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Scanning shared link
              </p>
              <ScanningAnimation />
            </div>
          </>
        )}

        {status === "previewing" && preview && (
          <>
            <CheckCircle className="text-green-400" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Ready to import from{" "}
                <span
                  style={{ color: PROVIDER_CONFIG[preview.provider].color }}
                >
                  {PROVIDER_CONFIG[preview.provider].name}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.messageCount} messages found
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="text-destructive" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Import failed
              </p>
              <p className="text-xs text-destructive">{error}</p>
            </div>
          </>
        )}

        {status === "importing" && (
          <>
            <Loader2 className="text-primary animate-spin" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Creating chat...
              </p>
              <p className="text-xs text-muted-foreground">
                Setting up your conversation
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="text-green-400" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Import complete!
              </p>
              <p className="text-xs text-muted-foreground">
                Redirecting to your chat...
              </p>
            </div>
          </>
        )}

        {/* Provider badge */}
        {provider && status !== "error" && (
          <div
            className="px-2 py-1 rounded-md text-xs font-medium"
            style={{
              backgroundColor: `${PROVIDER_CONFIG[provider].color}20`,
              color: PROVIDER_CONFIG[provider].color,
            }}
          >
            {PROVIDER_CONFIG[provider].name}
          </div>
        )}
      </div>

      {/* Content preview */}
      {status === "previewing" &&
        preview &&
        preview.previewMessages.length > 0 && (
          <PreviewMessageList
            messages={preview.previewMessages}
            messageCount={preview.messageCount}
          />
        )}

      {/* Scan visualization */}
      {status === "scanning" && <ScanningSkeleton />}
    </div>
  );
}
