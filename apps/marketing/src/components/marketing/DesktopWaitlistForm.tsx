"use client";

import { ArrowRight, Check, Loader2, Mail, UserCheck } from "lucide-react";
import { useState } from "react";
import { joinWaitlist, type WaitlistResult } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/metadata";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success" | "error";
type SuccessKind = "joined" | "existing_user";

export function DesktopWaitlistForm() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [message, setMessage] = useState("");
	const [successKind, setSuccessKind] = useState<SuccessKind>("joined");

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (status === "loading") return;

		const normalized = email.trim().toLowerCase();
		if (!EMAIL_RE.test(normalized)) {
			setStatus("error");
			setMessage("Enter a valid email address.");
			return;
		}

		setStatus("loading");
		setMessage("");

		try {
			const result: WaitlistResult = await joinWaitlist(normalized);

			if ("error" in result) {
				setStatus("error");
				setMessage(result.error);
				return;
			}

			setStatus("success");
			setSuccessKind(result.existingUser ? "existing_user" : "joined");
			setMessage(
				result.existingUser
					? "You already have a Kontinue AI account."
					: "You're on the list! 🚀",
			);
			setEmail("");
		} catch {
			setStatus("error");
			setMessage("Something went wrong. Please try again.");
		}
	};

	if (status === "success") {
		const isExistingUser = successKind === "existing_user";

		return (
			<div
				className="rounded-[1.15rem] border border-brand/20 bg-brand-tint/60 p-6 text-center sm:p-8"
				aria-live="polite"
			>
				<span className="mx-auto grid size-12 place-items-center rounded-full bg-brand text-brand-foreground">
					{isExistingUser ? (
						<UserCheck className="size-6" strokeWidth={2.2} />
					) : (
						<Check className="size-6" strokeWidth={2.5} />
					)}
				</span>
				<p className="font-display mt-5 text-2xl tracking-tight">{message}</p>
				<p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
					{isExistingUser
						? "We'll email all existing Kontinue AI users when the desktop app is ready. You don't need to join the waitlist."
						: "We'll email you the moment Kontinue AI Desktop is ready for your projects."}
				</p>
				<div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
					{isExistingUser ? (
						<Button asChild variant="brand" size="sm">
							<a href={APP_URL} target="_blank" rel="noopener noreferrer">
								Open Kontinue AI
								<ArrowRight className="size-4" />
							</a>
						</Button>
					) : null}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							setStatus("idle");
							setMessage("");
						}}
					>
						{isExistingUser ? "Use a different email" : "Add another email"}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<form onSubmit={submit} noValidate className="space-y-4">
			<div>
				<label
					htmlFor="waitlist-email"
					className="mb-2 block text-sm font-medium text-foreground"
				>
					Email address
				</label>
				<div className="relative">
					<Mail
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						id="waitlist-email"
						name="email"
						type="email"
						autoComplete="email"
						inputMode="email"
						placeholder="you@company.com"
						value={email}
						onChange={(event) => {
							setEmail(event.target.value);
							if (status === "error") {
								setStatus("idle");
								setMessage("");
							}
						}}
						aria-invalid={status === "error"}
						aria-describedby={message ? "waitlist-message" : undefined}
						disabled={status === "loading"}
						className={cn(
							"h-12 w-full rounded-full border bg-card pr-4 pl-11 text-[0.95rem] text-foreground outline-none transition placeholder:text-muted-foreground/60",
							"focus:border-brand focus:ring-2 focus:ring-brand/15",
							status === "error"
								? "border-destructive/50"
								: "border-border-strong",
							"disabled:opacity-60",
						)}
					/>
				</div>
			</div>

			<Button
				type="submit"
				size="lg"
				variant="brand"
				disabled={status === "loading"}
				className="w-full"
			>
				{status === "loading" ? (
					<>
						<Loader2 className="size-4 animate-spin" />
						Joining the waitlist…
					</>
				) : (
					<>
						Join the desktop waitlist
						<ArrowRight className="size-4" />
					</>
				)}
			</Button>

			{message ? (
				<p
					id="waitlist-message"
					role="alert"
					aria-live="polite"
					className="text-center text-sm text-destructive"
				>
					{message}
				</p>
			) : (
				<p className="text-center text-xs leading-relaxed text-muted-foreground">
					No spam. Just one email when the desktop app is ready.
				</p>
			)}
		</form>
	);
}
