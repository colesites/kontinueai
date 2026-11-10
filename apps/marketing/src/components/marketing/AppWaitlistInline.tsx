"use client";

import { track } from "@vercel/analytics";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success" | "error";

/**
 * Single-row "notify me" capture for the desktop and mobile apps. Uses the
 * same Clerk waitlist as the full form on /desktop-waitlist.
 */
export function AppWaitlistInline({ location }: { location: string }) {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [message, setMessage] = useState("");

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
			const result = await joinWaitlist(normalized);
			if ("error" in result) {
				setStatus("error");
				setMessage(result.error);
				return;
			}
			track("app_waitlist_joined", { location });
			setStatus("success");
			setMessage(
				result.existingUser
					? "You already have an account, so you are covered. We will email you at launch."
					: "You are on the list. We will email you at launch.",
			);
			setEmail("");
		} catch {
			setStatus("error");
			setMessage("Something went wrong. Please try again.");
		}
	};

	if (status === "success") {
		return (
			<p
				aria-live="polite"
				className="flex items-center gap-2.5 text-sm font-medium text-foreground"
			>
				<span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
					<Check className="size-3.5" strokeWidth={2.5} />
				</span>
				{message}
			</p>
		);
	}

	return (
		<form onSubmit={submit} noValidate className="w-full max-w-md">
			<div className="flex flex-col gap-2 sm:flex-row">
				<label htmlFor={`app-waitlist-${location}`} className="sr-only">
					Email address
				</label>
				<input
					id={`app-waitlist-${location}`}
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
					aria-describedby={
						message ? `app-waitlist-${location}-message` : undefined
					}
					disabled={status === "loading"}
					className={cn(
						"h-11 w-full min-w-0 shrink-0 rounded-full sm:w-auto sm:flex-1 sm:shrink border bg-card px-5 text-[0.95rem] text-foreground outline-none transition placeholder:text-muted-foreground/60",
						"focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60",
						status === "error"
							? "border-destructive/50"
							: "border-border-strong",
					)}
				/>
				<Button type="submit" disabled={status === "loading"}>
					{status === "loading" ? (
						<Loader2 className="size-4 animate-spin" />
					) : null}
					Notify me
					{status === "loading" ? null : <ArrowRight className="size-4" />}
				</Button>
			</div>
			{message ? (
				<p
					id={`app-waitlist-${location}-message`}
					role="alert"
					className="mt-2 pl-5 text-sm text-destructive"
				>
					{message}
				</p>
			) : null}
		</form>
	);
}
