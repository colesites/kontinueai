"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon, X } from "lucide-react";
import { useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@repo/ui/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/ui/dialog";
import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import Image from "next/image";

export type ModelSelectorProps = ComponentProps<typeof Dialog>;

export const ModelSelector = (props: ModelSelectorProps) => (
  <Dialog {...props} />
);

export type ModelSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

export type ModelSelectorContentProps = ComponentProps<typeof DialogContent> & {
  title?: ReactNode;
};

export const ModelSelectorContent = ({
  className,
  children,
  title = "Model Selector",
  ...props
}: ModelSelectorContentProps) => (
  <DialogContent
    className={cn(
      "glass-strong rounded-2xl p-0 border-foreground/10",
      // Close button — make it a real visible pill in the top right of the search row.
      // z-50 keeps it above the search row's z-10 so clicks actually reach it.
      "[&>button[data-slot=dialog-close]]:z-50",
      "[&>button[data-slot=dialog-close]]:top-3 [&>button[data-slot=dialog-close]]:right-3",
      "[&>button[data-slot=dialog-close]]:size-8 [&>button[data-slot=dialog-close]]:rounded-full",
      "[&>button[data-slot=dialog-close]]:bg-foreground/5 [&>button[data-slot=dialog-close]]:border [&>button[data-slot=dialog-close]]:border-foreground/8",
      "[&>button[data-slot=dialog-close]]:text-muted-foreground",
      "[&>button[data-slot=dialog-close]]:transition-all [&>button[data-slot=dialog-close]]:duration-200",
      "[&>button[data-slot=dialog-close]]:hover:bg-foreground/10 [&>button[data-slot=dialog-close]]:hover:text-foreground [&>button[data-slot=dialog-close]]:hover:scale-105",
      "[&>button[data-slot=dialog-close]>svg]:size-4",
      className
    )}
    {...props}
    onOpenAutoFocus={(e) => {
      props.onOpenAutoFocus?.(e);
      if (e.defaultPrevented) return;
      e.preventDefault();
    }}
  >
    <DialogTitle className="sr-only">{title}</DialogTitle>
    <Command className="**:data-[slot=command-input-wrapper]:h-auto bg-transparent">
      {children}
    </Command>
  </DialogContent>
);

export type ModelSelectorDialogProps = ComponentProps<typeof CommandDialog>;

export const ModelSelectorDialog = (props: ModelSelectorDialogProps) => (
  <CommandDialog {...props} />
);

export type ModelSelectorInputProps = ComponentProps<typeof CommandPrimitive.Input>;

export const ModelSelectorInput = ({
  className,
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  ...props
}: ModelSelectorInputProps) => {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;

  const handleChange = (next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    controlledOnValueChange?.(next);
  };

  return (
    <div className="flex items-center gap-3 border-b border-foreground/8 pl-5 pr-14 h-14 shrink-0 relative z-10">
      <SearchIcon className="size-4 shrink-0 text-muted-foreground/70" />
      <CommandPrimitive.Input
        value={value}
        onValueChange={handleChange}
        className={cn(
          "placeholder:text-muted-foreground/60 flex h-full w-full bg-transparent text-[15px] outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => handleChange("")}
          aria-label="Clear search"
          className="flex items-center justify-center size-6 rounded-full text-muted-foreground/70 transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground shrink-0"
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};

export type ModelSelectorListProps = ComponentProps<typeof CommandList>;

export const ModelSelectorList = (props: ModelSelectorListProps) => (
  <CommandList {...props} />
);

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>;

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
);

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>;

export const ModelSelectorItem = (props: ModelSelectorItemProps) => (
  <CommandItem {...props} />
);

export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

export type ModelSelectorLogoProps = Omit<ComponentProps<"img">, "src" | "alt"> & {
  provider:
    | "moonshotai-cn"
    | "lucidquery"
    | "moonshotai"
    | "zai-coding-plan"
    | "alibaba"
    | "xai"
    | "vultr"
    | "nvidia"
    | "upstage"
    | "groq"
    | "github-copilot"
    | "mistral"
    | "vercel"
    | "nebius"
    | "nebius"
    | "alibaba-cn"
    | "google-vertex-anthropic"
    | "venice"
    | "chutes"
    | "cortecs"
    | "github-models"
    | "togetherai"
    | "azure"
    | "baseten"
    | "huggingface"
    | "opencode"
    | "fastrouter"
    | "google"
    | "google-vertex"
    | "cloudflare-workers-ai"
    | "inception"
    | "wandb"
    | "openai"
    | "zhipuai-coding-plan"
    | "perplexity"
    | "openrouter"
    | "zenmux"
    | "v0"
    | "iflowcn"
    | "synthetic"
    | "deepinfra"
    | "zhipuai"
    | "submodel"
    | "zai"
    | "inference"
    | "requesty"
    | "morph"
    | "lmstudio"
    | "anthropic"
    | "aihubmix"
    | "fireworks-ai"
    | "modelscope"
    | "llama"
    | "scaleway"
    | "amazon-bedrock"
    | "cerebras"
    | (string & {});
};

export const ModelSelectorLogo = ({
  provider,
  className,
  ...props
}: ModelSelectorLogoProps) => (
  <Image
    {...props}
    alt={`${provider} logo`}
    // The kontinue icon is already full-color; don't invert it in dark mode.
    className={cn("size-3", provider !== "kontinue" && "dark:invert", className)}
    height={12}
    // K-AI is our own layer — models.dev has no logo for it; use the square
    // brand icon (the wordmark .svg is for wider/rectangular placements).
    src={
      provider === "kontinue"
        ? "/kontinueai-icon.png"
        : `https://models.dev/logos/${provider}.svg`
    }
    width={12}
  />
);

export type ModelSelectorLogoGroupProps = ComponentProps<"div">;

export const ModelSelectorLogoGroup = ({
  className,
  ...props
}: ModelSelectorLogoGroupProps) => (
  <div
    className={cn(
      "-space-x-1 flex shrink-0 items-center [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground",
      className
    )}
    {...props}
  />
);

export type ModelSelectorNameProps = ComponentProps<"span">;

export const ModelSelectorName = ({
  className,
  ...props
}: ModelSelectorNameProps) => (
  <span className={cn("flex-1 truncate text-left", className)} {...props} />
);
