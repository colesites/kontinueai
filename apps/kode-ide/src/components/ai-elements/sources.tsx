"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

// Displays the sources / citations used to generate a response.

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible className={cn("not-prose mb-2 text-xs", className)} {...props} />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group flex items-center gap-1.5 text-foreground/55 transition-colors hover:text-foreground/80",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-3.5" />
        <span>
          Used {count} source{count === 1 ? "" : "s"}
        </span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn("mt-2 flex flex-col gap-1.5 pl-1", className)}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a"> & {
  title?: string;
};

export const Source = ({ href, title, children, className, ...props }: SourceProps) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className={cn(
      "flex items-center gap-1.5 text-foreground/60 underline-offset-2 hover:text-foreground hover:underline",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-3 shrink-0" />
        <span className="truncate">{title ?? href}</span>
      </>
    )}
  </a>
);
