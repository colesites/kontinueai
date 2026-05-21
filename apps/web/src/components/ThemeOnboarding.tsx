"use client";

import { useState, useEffect } from "react";
import { CheckIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { cn } from "@repo/ui/lib/utils";
import {
  THEMES,
  type Theme,
  setColorTheme,
  hasCompletedThemeOnboarding,
  markThemeOnboardingComplete,
  getThemeLabel,
  getThemePrimaryColor,
} from "../lib/theme";

interface ThemeOnboardingProps {
  onComplete?: () => void;
}

const THEME_DESCRIPTIONS: Record<Theme, string> = {
  default: "Classic pink & red tones",
  emerald: "Fresh green & teal vibes",
  chelsea: "Royal blue with gold accents",
  amethyst: "Bold violet & plum palette",
  normal: "Clean black & white",
};

export function ThemeOnboarding({ onComplete }: ThemeOnboardingProps) {
  const [open, setOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme>("default");

  useEffect(() => {
    if (!hasCompletedThemeOnboarding()) {
      const t = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleContinue = () => {
    setColorTheme(selectedTheme);
    markThemeOnboardingComplete();
    setOpen(false);
    onComplete?.();
  };

  const handleThemePreview = (theme: Theme) => {
    setSelectedTheme(theme);
    setColorTheme(theme);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "glass-strong rounded-2xl p-0 max-w-md border-foreground/10 overflow-hidden gap-0",
          // close pill — same recipe as the model selector / how-to / import
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

        <div className="px-7 pt-7 pb-6">
          {/* Header */}
          <div className="mb-6">
            <span className="eyebrow">Personalize</span>
            <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Choose your theme
            </DialogTitle>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground/85">
              Pick a color palette that feels like you. You can change this
              anytime from the theme menu.
            </p>
          </div>

          {/* Theme list */}
          <RadioGroup
            value={selectedTheme}
            onValueChange={handleThemePreview}
            className="flex flex-col gap-1.5"
          >
            {THEMES.map((theme, i) => {
              const isSelected = selectedTheme === theme;
              const color = getThemePrimaryColor(theme);
              return (
                <label
                  key={theme}
                  htmlFor={theme}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-3.5 rounded-xl px-3 py-2.5 transition-all duration-200 animate-fade-in-up",
                    isSelected
                      ? "bg-primary/8 ring-1 ring-primary/25 shadow-[0_4px_16px_-8px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
                      : "ring-1 ring-foreground/6 hover:bg-foreground/4 hover:ring-foreground/12",
                  )}
                >
                  <RadioGroupItem value={theme} id={theme} className="sr-only" />

                  {/* Theme color swatch */}
                  <span
                    className={cn(
                      "relative flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105",
                      isSelected && "scale-105",
                    )}
                    style={{
                      background: `radial-gradient(circle at 30% 30%, color-mix(in oklch, ${color} 100%, white 15%), ${color} 70%)`,
                      boxShadow: `inset 0 1px 0 color-mix(in oklch, white 25%, transparent), 0 4px 12px -4px color-mix(in oklch, ${color} 50%, transparent)`,
                    }}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 rounded-full ring-2 ring-background ring-offset-2 ring-offset-primary/40" />
                    )}
                  </span>

                  {/* Name + description */}
                  <div className="flex flex-1 flex-col min-w-0">
                    <span className="text-[14px] font-medium text-foreground">
                      {getThemeLabel(theme)}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground/80 leading-tight">
                      {THEME_DESCRIPTIONS[theme]}
                    </span>
                  </div>

                  {/* Selection indicator */}
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full transition-all duration-200 shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground scale-100 shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
                        : "scale-75 opacity-0",
                    )}
                  >
                    <CheckIcon className="size-3" strokeWidth={3} />
                  </span>
                </label>
              );
            })}
          </RadioGroup>

          {/* CTA */}
          <button
            type="button"
            onClick={handleContinue}
            className={cn(
              "mt-7 w-full inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13.5px] font-semibold transition-all duration-200",
              "bg-primary text-primary-foreground",
              "shadow-[0_4px_14px_-4px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
              "hover:scale-[1.02] hover:bg-primary/95",
              "hover:shadow-[0_6px_20px_-4px_color-mix(in_oklch,var(--primary)_65%,transparent)]",
              "active:scale-[0.98]",
            )}
          >
            Continue
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
