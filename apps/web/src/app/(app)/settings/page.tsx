"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { api } from "@repo/convex/convex/_generated/api";
import {
	getSavedSpeechLanguage,
	SPEECH_LANGUAGE_OPTIONS,
	setSavedSpeechLanguage,
} from "@repo/core/speech-settings";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft, LogOut } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SettingsAccountPanel } from "../../../features/settings/components/SettingsAccountPanel";
import { SettingsContactCards } from "../../../features/settings/components/SettingsContactCards";
import { SettingsDataPanel } from "../../../features/settings/components/SettingsDataPanel";
import { SettingsMemoryPanel } from "../../../features/settings/components/SettingsMemoryPanel";
import { SettingsProfileSidebar } from "../../../features/settings/components/SettingsProfileSidebar";
import { SettingsReferralPanel } from "../../../features/settings/components/SettingsReferralPanel";
import { usePlanTier } from "../../../lib/use-plan-tier";

type SettingsTab = "account" | "invite" | "memory" | "data" | "contact";

const TABS: { id: SettingsTab; label: string }[] = [
	{ id: "account", label: "Account" },
	{ id: "invite", label: "Invite" },
	{ id: "memory", label: "Memory" },
	{ id: "data", label: "Data" },
	{ id: "contact", label: "Contact" },
];

export default function SettingsPage() {
	const { back } = useRouter();
	const searchParams = useSearchParams();
	const { user } = useUser();
	const usage = useQuery(api.messages.getMonthlyUsage, {});
	const currentPlanTier = usePlanTier();
	const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
		// Allow deep-linking to a tab, e.g. /settings?tab=invite from the sidebar CTA.
		const requested = searchParams.get("tab");
		return TABS.some((t) => t.id === requested)
			? (requested as SettingsTab)
			: "account";
	});
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
				{/* Top bar */}
				<div className="mb-8 flex items-center justify-between gap-3">
					<button
						type="button"
						onClick={() => back()}
						className="group surface-inset inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground"
					>
						<ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
						Back to chat
					</button>
					<SignOutButton>
						<button
							type="button"
							className="surface-inset inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive"
						>
							<LogOut className="size-4" />
							Sign out
						</button>
					</SignOutButton>
				</div>

				{/* Page heading */}
				<div className="mb-8">
					<p className="eyebrow">Settings</p>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight">
						Your account
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Manage your profile, usage, memory, and data.
					</p>
				</div>

				<div className="grid gap-6 lg:grid-cols-[300px_1fr]">
					<SettingsProfileSidebar
						imageUrl={user?.imageUrl}
						userInitial={userInitial}
						displayName={displayName}
						userEmail={userEmail}
						currentPlanTier={currentPlanTier}
					/>

					<section className="surface-card rounded-2xl p-6">
						<div className="mb-6">
							<div className="surface-inset inline-flex gap-0.5 rounded-xl p-1">
								{TABS.map((tab) => (
									<button
										key={tab.id}
										type="button"
										onClick={() => setActiveTab(tab.id)}
										className={cn(
											"rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150",
											activeTab === tab.id
												? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
												: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
										)}
									>
										{tab.label}
									</button>
								))}
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
						) : activeTab === "invite" ? (
							<SettingsReferralPanel />
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
