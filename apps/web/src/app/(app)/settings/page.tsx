"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { usePlanTier } from "../../../lib/use-plan-tier";
import { useQuery } from "convex/react";
import { ArrowLeft, LogOut } from "lucide-react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  getSavedSpeechLanguage,
  SPEECH_LANGUAGE_OPTIONS,
  setSavedSpeechLanguage,
} from "@repo/core/speech-settings";
import { SettingsProfileSidebar } from "../../../features/settings/components/SettingsProfileSidebar";
import { SettingsContactCards } from "../../../features/settings/components/SettingsContactCards";
import { SettingsAccountPanel } from "../../../features/settings/components/SettingsAccountPanel";
import { SettingsMemoryPanel } from "../../../features/settings/components/SettingsMemoryPanel";
import { SettingsDataPanel } from "../../../features/settings/components/SettingsDataPanel";

type SettingsTab = "account" | "memory" | "data" | "contact";

export default function SettingsPage() {
  const { back } = useRouter();
  const { user } = useUser();
  const usage = useQuery(api.messages.getMonthlyUsage, {});
  const currentPlanTier = usePlanTier();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() =>
    getSavedSpeechLanguage(),
  );

  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account";
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "Signed in user";
  const userInitial = (
    user?.firstName?.charAt(0) ??
    displayName.charAt(0) ??
    "U"
  ).toUpperCase();

  const selectedLanguageLabel = useMemo(() => {
    const selected = SPEECH_LANGUAGE_OPTIONS.find(
      (option) => option.value === selectedLanguage,
    );
    return selected?.label ?? "Auto detect (Recommended)";
  }, [selectedLanguage]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => back()}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Chat
          </button>
          <SignOutButton>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </SignOutButton>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <SettingsProfileSidebar
            imageUrl={user?.imageUrl}
            userInitial={userInitial}
            displayName={displayName}
            userEmail={userEmail}
            currentPlanTier={currentPlanTier}
          />

          <section className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm">
            <div className="mb-6">
              <div className="inline-flex rounded-xl border border-border/70 bg-background/60 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("account")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeTab === "account"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("memory")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeTab === "memory"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Memory
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("data")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeTab === "data"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Data
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("contact")}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeTab === "contact"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Contact Us
                </button>
              </div>
            </div>
            {activeTab === "account" ? (
              <SettingsAccountPanel
                selectedLanguage={selectedLanguage}
                selectedLanguageLabel={selectedLanguageLabel}
                onLanguageChange={(value) => {
                  const saved = setSavedSpeechLanguage(value);
                  setSelectedLanguage(saved);
                }}
                usage={usage}
              />
            ) : activeTab === "memory" ? (
              <SettingsMemoryPanel />
            ) : activeTab === "data" ? (
              <SettingsDataPanel />
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Contact Us
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Legal and policy information.
                  </p>
                </div>

                <SettingsContactCards />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
