"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// Sleek single-month calendar tuned for the Kontinue theme. Selected day uses
// the primary token; today gets a subtle ring; range/hover states are soft.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center h-8 relative",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1 absolute inset-x-0 top-0 justify-between px-0.5",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 text-muted-foreground hover:text-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 text-muted-foreground hover:text-foreground"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground/70 rounded-md w-9 text-[0.7rem] font-medium uppercase tracking-wide",
        week: "flex w-full mt-1.5",
        day: "relative p-0 text-center text-sm",
        day_button: cn(
          "size-9 rounded-lg font-normal text-foreground transition-colors",
          "hover:bg-foreground/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ),
        today:
          "[&>button]:ring-1 [&>button]:ring-primary/50 [&>button]:font-semibold",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90 [&>button]:hover:text-primary-foreground",
        outside: "[&>button]:text-muted-foreground/40",
        disabled: "[&>button]:text-muted-foreground/30 [&>button]:opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("size-4", cls)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
