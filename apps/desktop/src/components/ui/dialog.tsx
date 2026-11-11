// The one dialog every screen uses: shared scrim, overlay surface, header
// layout, focus trap, Escape and click-outside to close. Built on Radix so
// focus returns to the control that opened it.

import type * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const WIDTH = {
  sm: "max-w-[400px]",
  md: "max-w-[460px]",
  lg: "max-w-[620px]",
  xl: "max-w-[760px]",
} as const;

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({
  title,
  description,
  eyebrow,
  size = "md",
  position = "center",
  hideHeader = false,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  /** Always required: read by screen readers even when the header is hidden. */
  title: string;
  description?: React.ReactNode;
  /** Small label above the title ("Project", "Share"). */
  eyebrow?: string;
  size?: keyof typeof WIDTH;
  /** "top" pins the dialog near the top so a results list can grow downward. */
  position?: "center" | "top";
  /** Search-style dialogs draw their own header row. */
  hideHeader?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="kontinue-scrim fixed inset-0 z-[70] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[70] flex justify-center p-4",
          position === "center" ? "items-center" : "items-start pt-[14vh]",
        )}
      >
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "liquid-glass-dropdown pointer-events-auto relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden text-popover-foreground outline-none duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
            WIDTH[size],
            className,
          )}
          {...props}
        >
          {hideHeader ? (
            <>
              <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
              ) : null}
            </>
          ) : (
            <header className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-1">
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="mb-1 text-micro font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {eyebrow}
                  </p>
                ) : null}
                <DialogPrimitive.Title className="text-[15px] leading-snug font-semibold text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-label leading-relaxed text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mt-1 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
              >
                <X size={15} />
              </DialogPrimitive.Close>
            </header>
          )}
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

/** Padded, scrollable body below the header. */
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5", className)} {...props} />;
}

/** Right-aligned actions: secondary first, primary last. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center justify-end gap-2 px-5 pb-5", className)} {...props} />;
}

export const DialogClose = DialogPrimitive.Close;

/** Shared text input for dialogs and inline forms. */
export function fieldClassName(extra?: string) {
  return cn(
    "w-full rounded-[14px] border border-black/[0.1] bg-black/[0.02] px-3 text-body text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[var(--brand)] dark:border-white/[0.1] dark:bg-white/[0.03]",
    extra,
  );
}
