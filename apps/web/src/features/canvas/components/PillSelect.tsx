import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";

interface PillSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: {
    value: string;
    label: string;
    icon?: React.ReactNode;
    isFree?: boolean;
    disabled?: boolean;
  }[];
  icon?: React.ReactNode;
  tooltip: string;
  label?: string;
  header?: string;
  className?: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  isPro?: boolean;
}

export function PillSelect({
  value,
  onChange,
  options,
  icon,
  tooltip,
  label,
  header,
  className,
  align = "start",
  disabled = false,
  isPro = false,
}: PillSelectProps) {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={cn("inline-flex shrink-0", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/40 bg-secondary/20 px-3.5 text-xs font-bold uppercase tracking-tight text-foreground/70 shadow-none transition-all hover:bg-secondary/40 hover:text-foreground focus:outline-none",
              disabled &&
                "pointer-events-none cursor-not-allowed opacity-20 grayscale"
            )}
            title={tooltip}
          >
            {icon || selectedOption?.icon}
            <span className="max-w-[100px] truncate">
              {label || selectedOption?.label || value}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          sideOffset={12}
          align={align}
          className="z-100 max-h-[70vh] min-w-[160px] overflow-y-auto border-border/40 bg-background/90 p-2 text-popover-foreground shadow-2xl backdrop-blur-3xl"
        >
          {header && (
            <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-foreground/40">
              {header}
            </div>
          )}
          {options.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => !opt.disabled && onChange(opt.value)}
              disabled={opt.disabled}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-tight transition-all",
                opt.disabled && "cursor-not-allowed opacity-20 grayscale",
                !opt.disabled &&
                  (isPro
                    ? "opacity-100 grayscale-0 font-bold hover:bg-secondary/60 focus:bg-secondary/60"
                    : opt.isFree
                      ? "opacity-100 grayscale-0 font-black bg-secondary/10"
                      : "opacity-40 grayscale hover:opacity-100 hover:grayscale-0 hover:bg-secondary/60 focus:bg-secondary/60"),
                value === opt.value && "bg-secondary/40 opacity-100 grayscale-0"
              )}
            >
              {opt.icon}
              <span className="flex-1">{opt.label}</span>
              {value === opt.value && (
                <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
