"use client";

import type { PlanTier } from "@repo/core/plan-tier";
import {
	SPEECH_AUTO_LANGUAGE,
	SPEECH_LANGUAGE_OPTIONS,
} from "@repo/core/speech-settings";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import { SettingsUsagePanel } from "./SettingsUsagePanel";

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
		<div className="space-y-8">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">Account</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Voice input language preferences for speech recognition.
				</p>
			</div>

			<div className="surface-inset rounded-2xl p-5">
				<p className="text-sm font-semibold text-foreground">
					Preferred voice language
				</p>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					When you choose a specific language, voice input listens only in that
					language. Only Auto mode rotates across languages.
				</p>

				<div className="mt-4 max-w-md">
					<Select value={selectedLanguage} onValueChange={onLanguageChange}>
						<SelectTrigger className="surface-card h-10 w-full">
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

				<div className="surface-card mt-4 rounded-lg px-3 py-2 text-xs text-muted-foreground">
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
					<h3 className="text-base font-semibold tracking-tight">Usage</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						Track monthly message and import usage.
					</p>
				</div>

				<div className="surface-inset rounded-2xl p-5">
					<SettingsUsagePanel usage={usage} />
				</div>
			</div>
		</div>
	);
}
