"use client";

import { ImageIcon } from "lucide-react";

export function ImageGenerationLoader() {
  return (
    <div className="flex gap-4 px-4 py-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
        <ImageIcon size={16} className="animate-pulse" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            Generating image
          </span>
          <span className="flex gap-0.5">
            <span className="typing-dot h-1 w-1 rounded-full bg-muted-foreground" />
            <span className="typing-dot h-1 w-1 rounded-full bg-muted-foreground" />
            <span className="typing-dot h-1 w-1 rounded-full bg-muted-foreground" />
          </span>
        </div>
        <div className="relative w-64 h-64 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden">
          {/* Animated shimmer effect */}
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]">
            <div className="h-full w-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
          </div>
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 opacity-20">
            <div className="grid grid-cols-8 grid-rows-8 h-full w-full">
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className="border border-muted-foreground/10" />
              ))}
            </div>
          </div>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon
              size={48}
              className="text-muted-foreground/40 animate-pulse"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
