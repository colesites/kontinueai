"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Gift, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function SettingsReferralPanel() {
	const summary = useQuery(api.referrals.getReferralSummary, {});
	const ensureReferralCode = useMutation(api.referrals.ensureReferralCode);
	const [code, setCode] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	// Ensure the user has a code so their invite link is ready to share.
	useEffect(() => {
		if (summary === undefined) return; // still loading
		if (summary.code) {
			setCode(summary.code);
			return;
		}
		let cancelled = false;
		void ensureReferralCode({})
			.then((generated) => {
				if (!cancelled) setCode(generated);
			})
			.catch(() => {
				// Ignore: the panel still renders; the link just stays pending.
			});
		return () => {
			cancelled = true;
		};
	}, [summary, ensureReferralCode]);

	const inviteLink = code
		? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${code}`
		: "";

	const handleCopy = async () => {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			setCopied(true);
			toast.success("Invite link copied");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Couldn't copy link");
		}
	};

	if (summary === undefined) {
		return (
			<div className="flex items-center justify-center py-4">
				<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-semibold tracking-tight">Invite & earn</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					Share your link. When someone you invite subscribes to a paid plan,
					you earn 100 video-generation credits.
				</p>
			</div>

			<div className="space-y-2">
				<span className="text-sm font-medium">Your invite link</span>
				<div className="flex items-center gap-2">
					<input
						readOnly
						aria-label="Your invite link"
						value={inviteLink}
						placeholder="Generating your link…"
						className="surface-inset min-w-0 flex-1 rounded-xl px-3.5 py-2 text-[13px] text-muted-foreground"
					/>
					<button
						type="button"
						onClick={handleCopy}
						disabled={!inviteLink}
						className="surface-inset inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium text-foreground transition-all duration-150 hover:bg-foreground/8 disabled:opacity-50"
					>
						{copied ? (
							<Check className="size-4" />
						) : (
							<Copy className="size-4" />
						)}
						{copied ? "Copied" : "Copy"}
					</button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="surface-inset rounded-xl p-4">
					<div className="flex items-center gap-2 text-muted-foreground">
						<Users className="size-4" />
						<span className="text-[11px] font-medium uppercase tracking-wide">
							Invited
						</span>
					</div>
					<p className="mt-1 text-2xl font-semibold tabular-nums">
						{summary.invitedCount}
					</p>
				</div>
				<div className="surface-inset rounded-xl p-4">
					<div className="flex items-center gap-2 text-muted-foreground">
						<Gift className="size-4" />
						<span className="text-[11px] font-medium uppercase tracking-wide">
							Paid &amp; rewarded
						</span>
					</div>
					<p className="mt-1 text-2xl font-semibold tabular-nums">
						{summary.convertedCount}
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<div className="flex justify-between text-sm">
					<span className="font-medium">Bonus video credits</span>
					<span className="tabular-nums text-muted-foreground">
						{summary.bonusRemaining} / {summary.bonusTotal}
					</span>
				</div>
				<p className="text-[11px] leading-relaxed text-muted-foreground">
					Earned from referrals. These let you generate video even on Free or
					Starter, and stack on top of Pro's monthly allowance. Once they run
					out, video returns to your plan's normal access.
				</p>
			</div>
		</div>
	);
}
