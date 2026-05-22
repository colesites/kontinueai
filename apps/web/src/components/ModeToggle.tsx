"use client";

import { Moon, Sun, CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@repo/ui/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  THEMES,
  type Theme,
  getSavedTheme,
  setColorTheme,
  getThemeLabel,
  getThemePrimaryColor,
} from "../lib/theme";

const MODES = ["light", "dark", "system"] as const;
type Mode = (typeof MODES)[number];

const MODE_LABEL: Record<Mode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ModeToggle({ className }: { className?: string }) {
  const { theme: darkMode, setTheme: setDarkMode } = useTheme();
  const [colorTheme, setColorThemeState] = useState<Theme>(
    () => getSavedTheme() ?? "default",
  );

  const handleColorThemeChange = (theme: Theme) => {
    setColorTheme(theme);
    setColorThemeState(theme);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Toggle theme"
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className,
          )}
        >
          <Sun className="size-4 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-4 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className={cn(
          "glass bg-background/40 backdrop-blur-3xl rounded-2xl p-2 min-w-56 border-foreground/10",
          // Strip default DropdownMenuItem styling that fights ours
          "**:data-[slot=dropdown-menu-item]:rounded-lg **:data-[slot=dropdown-menu-item]:px-2.5 **:data-[slot=dropdown-menu-item]:py-2",
          "**:data-[slot=dropdown-menu-item]:focus:bg-foreground/6 **:data-[slot=dropdown-menu-item]:focus:text-foreground",
        )}
      >
        {/* Mode section */}
        <div className="px-2 pt-1 pb-2">
          <span className="eyebrow">Appearance</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {MODES.map((mode) => {
            const isActive = darkMode === mode;
            return (
              <DropdownMenuItem
                key={mode}
                onClick={() => setDarkMode(mode)}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                        : "bg-foreground/5 text-muted-foreground",
                    )}
                  >
                    {mode === "light" && <Sun className="size-3" />}
                    {mode === "dark" && <Moon className="size-3" />}
                    {mode === "system" && (
                      <span className="size-2 rounded-full bg-current opacity-70" />
                    )}
                  </span>
                  <span className="text-[13px] font-medium text-foreground">
                    {MODE_LABEL[mode]}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent)] scale-100"
                      : "scale-75 opacity-0",
                  )}
                >
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator className="my-2 bg-foreground/8" />

        {/* Color theme section */}
        <div className="px-2 pt-1 pb-2">
          <span className="eyebrow">Color theme</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {THEMES.map((theme) => {
            const isActive = colorTheme === theme;
            const color = getThemePrimaryColor(theme);
            return (
              <DropdownMenuItem
                key={theme}
                onClick={() => handleColorThemeChange(theme)}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, color-mix(in oklch, ${color} 100%, white 15%), ${color} 70%)`,
                      boxShadow: `inset 0 1px 0 color-mix(in oklch, white 25%, transparent), 0 2px 6px -2px color-mix(in oklch, ${color} 50%, transparent)`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-medium text-foreground">
                    {getThemeLabel(theme)}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent)] scale-100"
                      : "scale-75 opacity-0",
                  )}
                >
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
