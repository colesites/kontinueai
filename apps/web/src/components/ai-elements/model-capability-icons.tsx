"use client";

import { RxText } from "react-icons/rx";
import { LuImagePlus, LuSaveAll } from "react-icons/lu";
import { RiSaveLine } from "react-icons/ri";
import { IoSearch } from "react-icons/io5";
import { ImEmbed2 } from "react-icons/im";
import { Brain } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import type { ModelCapability } from "@repo/core/model-capabilities";
import { cn } from "@repo/ui/lib/utils";

const CAPABILITY_META: Record<
  ModelCapability,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  text: { label: "Text", Icon: RxText },
  "image-generation": { label: "Image Gen", Icon: LuImagePlus },
  "implicit-caching": { label: "Implicit Caching", Icon: RiSaveLine },
  "explicit-caching": { label: "Explicit Caching", Icon: LuSaveAll },
  "web-search": { label: "Web Search", Icon: IoSearch },
  thinking: { label: "Thinking", Icon: Brain },
  embedding: { label: "Embedding", Icon: ImEmbed2 },
};

export function ModelCapabilityIcons({
  capabilities,
  className,
}: {
  capabilities: ModelCapability[];
  className?: string;
}) {
  if (!capabilities.length) return null;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {capabilities.map((cap) => {
        const meta = CAPABILITY_META[cap];
        const Icon = meta.Icon;

        return (
          <Tooltip key={cap}>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/80 hover:text-foreground inline-flex items-center">
                <Icon className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>{meta.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
