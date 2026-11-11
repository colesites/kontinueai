// Building blocks shared by every Settings page: grouped cards, rows with a
// label + description on the left and a control on the right, and the small
// pill controls used inside them.

import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function openExternal(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank"));
}

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  /** Shown on the right of the title (e.g. "+ New task"). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      {title || action ? (
        <div className="mb-2 flex min-h-6 items-center justify-between gap-3 px-1">
          {title ? <h2 className="text-label font-medium text-muted-foreground">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  description,
  badge,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Small tag after the label ("Beta", "Custom", a version…). */
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 px-5 py-3.5", className)}>
      <div className="min-w-0 max-w-[620px]">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-foreground/90">
          {label}
          {badge}
        </p>
        {description ? (
          <div className="mt-0.5 text-label leading-relaxed text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-body font-medium text-foreground/90">{title}</p>
      {children ? <p className="mt-0.5 text-label text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "purple" | "amber" | "green" | "red" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-px text-micro font-medium leading-4",
        tone === "neutral" && "border-black/10 text-muted-foreground dark:border-white/10",
        tone === "purple" && "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "green" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "red" && "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="kontinue-3d flex items-center gap-0.5 rounded-full p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label transition-colors",
            value === option.value
              ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100"
              : "border border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  minWidth = 170,
}: {
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  minWidth?: number;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={{ minWidth }}
          className="kontinue-3d flex h-8 cursor-pointer items-center justify-between gap-2 rounded-full px-3.5 text-label text-foreground/90"
        >
          <span className="truncate">{selected?.label}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>
            <div className="min-w-0 flex-1">
              <p className="truncate">{option.label}</p>
              {option.description ? (
                <p className="text-caption leading-snug text-muted-foreground">{option.description}</p>
              ) : null}
            </div>
            {option.value === value ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PillButton({
  children,
  onClick,
  tone = "neutral",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium transition-colors disabled:cursor-default disabled:opacity-50",
        tone === "primary" && "kontinue-3d-primary",
        tone === "neutral" && "kontinue-3d text-foreground/85 hover:text-foreground",
        tone === "danger" && "kontinue-3d text-rose-500 hover:text-rose-400",
      )}
    >
      {children}
    </button>
  );
}

/** Small text button for a card header ("+ New task", "Refresh"). */
export function LinkButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-1 text-label text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Keys({ keys, size = "md" }: { keys: string[]; size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className={cn(
            "kontinue-3d flex items-center justify-center rounded-md font-sans text-foreground/80",
            size === "sm" ? "h-5 min-w-5 px-1.5 text-caption" : "h-6 min-w-6 px-2 text-caption",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  className,
  type = "text",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  min?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "kontinue-3d h-8 rounded-full bg-transparent px-3.5 text-label outline-none placeholder:text-muted-foreground/60",
        className,
      )}
      {...rest}
    />
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Readable text for a failed Rust command. "Command … not found" means the
 *  app is an older build than this screen (restart it to pick up the update). */
export function staleBuildMessage(cause: unknown): string {
  const text = String(cause);
  if (/command .* not found/i.test(text)) {
    return "This needs a newer build of the app. Quit and restart Kontinue (or restart tauri dev) to load it.";
  }
  return text;
}
