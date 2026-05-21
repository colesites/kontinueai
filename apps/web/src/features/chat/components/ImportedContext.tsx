"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Clock } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { PROVIDER_CONFIG } from "@repo/utils/url-safety";
import type { Provider } from "@repo/utils/url-safety";
import type { ImportedContextProps } from "../types";

export function ImportedContext({
  provider,
  sourceUrl,
  importedAt,
  messageCount,
}: ImportedContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const providerTyped = provider as Provider;

  const formattedDate = new Date(importedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="border-b border-border bg-background/50 backdrop-blur">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: PROVIDER_CONFIG[providerTyped].color }}
          />
          <span className="text-muted-foreground">
            Continued from{" "}
            <span
              className="font-medium"
              style={{ color: PROVIDER_CONFIG[providerTyped].color }}
            >
              {PROVIDER_CONFIG[providerTyped].name}
            </span>
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            {messageCount} imported messages
          </span>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock size={14} />
            <span>Imported {formattedDate}</span>
          </div>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink size={14} />
              <span className="truncate">{sourceUrl}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
