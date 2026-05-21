"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { cn } from "@repo/ui/lib/utils";

const STEPS = [
  {
    title: "Start from chat input",
    description: "Type your prompt below. A new conversation opens instantly.",
  },
  {
    title: "Import when needed",
    description: "Use the import button to paste a shared link in a modal.",
  },
  {
    title: "Continue naturally",
    description: "Pick your model and keep going with full context.",
  },
];

export function HowToButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground underline underline-offset-4 decoration-foreground/20 hover:decoration-foreground/40"
      >
        How does this work?
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className={cn(
            "glass-strong rounded-2xl p-0 max-w-md border-foreground/10 overflow-hidden gap-0",
            // Close pill — same recipe as the model selector
            "[&>button[data-slot=dialog-close]]:z-50",
            "[&>button[data-slot=dialog-close]]:top-4 [&>button[data-slot=dialog-close]]:right-4",
            "[&>button[data-slot=dialog-close]]:size-8 [&>button[data-slot=dialog-close]]:rounded-full",
            "[&>button[data-slot=dialog-close]]:bg-foreground/5 [&>button[data-slot=dialog-close]]:border [&>button[data-slot=dialog-close]]:border-foreground/8",
            "[&>button[data-slot=dialog-close]]:text-muted-foreground",
            "[&>button[data-slot=dialog-close]]:transition-all [&>button[data-slot=dialog-close]]:duration-200",
            "[&>button[data-slot=dialog-close]]:hover:bg-foreground/10 [&>button[data-slot=dialog-close]]:hover:text-foreground [&>button[data-slot=dialog-close]]:hover:scale-105",
            "[&>button[data-slot=dialog-close]>svg]:size-4",
          )}
        >
          {/* Accent bar */}
          <div className="h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

          <div className="px-7 pt-7 pb-8">
            {/* Header */}
            <div className="mb-7">
              <span className="eyebrow">Get started</span>
              <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                How it works
              </DialogTitle>
            </div>

            {/* Steps timeline */}
            <div className="relative">
              {/* vertical connector */}
              <div className="absolute left-5 top-6 bottom-6 w-px bg-linear-to-b from-primary/25 via-foreground/8 to-foreground/4" />

              <ol className="flex flex-col gap-5">
                {STEPS.map((step, i) => (
                  <li
                    key={step.title}
                    className="relative flex gap-4 animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Number badge */}
                    <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/15 to-primary/5 text-primary text-[13px] font-semibold ring-1 ring-primary/20 shadow-[0_4px_12px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent),inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 pt-1.5">
                      <h3 className="text-[14.5px] font-medium leading-tight text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground/80">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
