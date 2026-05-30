"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { SettingsUsagePanel } from "./SettingsUsagePanel";
import {
  SPEECH_AUTO_LANGUAGE,
  SPEECH_LANGUAGE_OPTIONS,
} from "@repo/core/speech-settings";
import type { PlanTier } from "@repo/core/plan-tier";

type SettingsAccountPanelProps = {
  selectedLanguage: string;
  selectedLanguageLabel: string;
  onLanguageChange: (value: string) => void;
  usage:
  | {
    planTier: PlanTier;
    isPaid: boolean;
    kaiUsed: number;
    kaiLimit: number | null;
    freeMonthlyUsed: number;
    freeMonthlyLimit: number;
    paidPremiumUsed: number;
    paidPremiumLimit: number;
    paidStandardUsed: number;
    paidStandardLimit: number;
    paidTotalUsed: number;
    paidTotalLimit: number;
    monthlyImportUsed: number;
    monthlyImportLimit: number | null;
  }
  | null
  | undefined;
};

export function SettingsAccountPanel({
  selectedLanguage,
  selectedLanguageLabel,
  onLanguageChange,
  usage,
}: SettingsAccountPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Voice input language preferences for speech recognition.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/70 p-5">
        <p className="text-sm font-medium text-foreground">
          Preferred Voice Language
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          When you choose a specific language, voice input listens only in that
          language. Only Auto mode rotates across languages.
        </p>

        <div className="mt-4 max-w-md">
          <Select value={selectedLanguage} onValueChange={onLanguageChange}>
            <SelectTrigger className="h-10 w-full border-border/70 bg-background/80">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {SPEECH_LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {option.nativeLabel ? ` - ${option.nativeLabel}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-muted-foreground">
          Current:{" "}
          <span className="font-medium text-foreground">
            {selectedLanguageLabel}
          </span>
          {selectedLanguage === SPEECH_AUTO_LANGUAGE
            ? " (best multilingual behavior)"
            : ""}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Usage</h3>
          <p className="text-sm text-muted-foreground">
            Track monthly message and import usage.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/70 p-5 space-y-6">
          <SettingsUsagePanel usage={usage} />
        </div>
      </div>
    </div>
  );
}
