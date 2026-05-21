"use client";

import Image from "next/image";
import { HowToButton } from "../../import/components/HowToButton";
import { type Provider } from "@repo/utils/url-safety";
import { HomeImportDialog } from "./HomeImportDialog";

type HomeIntroSectionProps = {
  firstName: string;
  importModalOpen: boolean;
  onImportModalOpenChange: (open: boolean) => void;
  importUrl: string;
  onImportUrlChange: (value: string) => void;
  importProvider: Provider;
  isImporting: boolean;
  onImport: () => void;
};

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

const PROVIDERS = [
  { name: "ChatGPT", color: "#10a37f" },
  { name: "Claude", color: "#cc785c" },
  { name: "Gemini", color: "#4285f4" },
  { name: "T3 Chat", color: "#f8e6f4" },
  { name: "Perplexity", color: "#20b8cd" },
  { name: "Mistral", color: "#ff7000" },
];

function Step({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex gap-3.5">
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/15 to-primary/5 text-primary text-[11px] font-semibold ring-1 ring-primary/20 shadow-[0_2px_8px_-4px_color-mix(in_oklch,var(--primary)_50%,transparent),inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex-1 pt-1">
        <p className="text-[13.5px] font-medium leading-tight text-foreground">
          {title}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground/80">
          {description}
        </p>
      </div>
    </div>
  );
}

function ProviderPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="group inline-flex items-center gap-1.5 rounded-full bg-foreground/5 ring-1 ring-foreground/8 px-2.5 py-1 text-[11.5px] font-medium text-foreground/85 transition-all duration-200 hover:bg-foreground/8 hover:ring-foreground/12">
      <span
        className="h-1.5 w-1.5 rounded-full transition-shadow duration-200 group-hover:shadow-[0_0_8px_0_currentColor]"
        style={{
          backgroundColor: color,
          color,
        }}
      />
      {name}
    </span>
  );
}

export function HomeIntroSection({
  firstName,
  importModalOpen,
  onImportModalOpenChange,
  importUrl,
  onImportUrlChange,
  importProvider,
  isImporting,
  onImport,
}: HomeIntroSectionProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col items-center justify-center px-4 pt-16 text-center">
      <Image
        src="/kontinueai.svg"
        alt="Kontinue AI"
        width={180}
        height={36}
        priority
        className="h-7 w-auto invert dark:invert-0 transition-[filter] opacity-90"
      />
      <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        How can I help you, {firstName}?
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        Ask anything to start a new chat, or import a shared link from another
        AI app.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <HowToButton />
        <HomeImportDialog
          open={importModalOpen}
          onOpenChange={onImportModalOpenChange}
          importUrl={importUrl}
          onImportUrlChange={onImportUrlChange}
          importProvider={importProvider}
          isImporting={isImporting}
          onImport={onImport}
        />
      </div>

      <div className="mt-10 w-full glass-subtle rounded-2xl p-6 text-left">
        <div className="mb-5 flex items-center justify-between">
          <span className="eyebrow">How it works</span>
          <span className="eyebrow text-[10px]! text-muted-foreground/60">
            3 steps
          </span>
        </div>

        <div className="relative">
          {/* timeline connector */}
          <div className="absolute left-4 top-5 bottom-5 w-px bg-linear-to-b from-primary/25 via-foreground/8 to-foreground/4" />
          <div className="flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <Step
                key={step.title}
                index={i + 1}
                title={step.title}
                description={step.description}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-foreground/6">
          <span className="eyebrow text-[10px]! mb-3 inline-block">
            Supported providers
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <ProviderPill key={p.name} name={p.name} color={p.color} />
            ))}
          </div>
        </div>
      </div>

      {/* Kode Desktop promotion card */}
      {/* <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-4 flex w-full items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-md"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-transform group-hover:scale-110">
          <Code2 size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Download Kode Desktop
          </p>
          <p className="text-xs text-muted-foreground">
            Get the full AI-powered coding environment as a standalone desktop
            application for the best performance.
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Download →
        </span>
      </Link> */}
    </div>
  );
}
