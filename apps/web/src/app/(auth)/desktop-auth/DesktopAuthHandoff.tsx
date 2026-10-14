"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Status =
	| { kind: "minting" }
	| { kind: "ready"; ticket: string; deepLink: string }
	| { kind: "error"; message: string };

const DEEP_LINK_BASE = "kontinueai://auth/callback";

export function DesktopAuthHandoff({
	state,
	email,
	returnTo,
	callbackPort,
}: {
	state: string;
	email: string | null;
	returnTo: string;
	callbackPort?: string;
}) {
	const [status, setStatus] = useState<Status>({ kind: "minting" });
	const [showCode, setShowCode] = useState(false);
	const [copied, setCopied] = useState(false);
	const started = useRef(false);

	const mintAndOpen = useCallback(async () => {
		setStatus({ kind: "minting" });
		setCopied(false);
		try {
			const response = await fetch("/api/desktop-auth/ticket", {
				method: "POST",
				cache: "no-store",
			});
			const data = (await response.json()) as { ticket?: string; error?: string };
			if (!response.ok || !data.ticket) {
				throw new Error(data.error ?? "Could not create a sign-in token");
			}

			const params = new URLSearchParams({
				ticket: data.ticket,
				state,
			}).toString();

			// If a localhost callback port was provided (desktop app dev loopback),
			// redirect to that localhost port first.
			if (callbackPort) {
				const loopbackUrl = `http://localhost:${callbackPort}/?${params}`;
				setStatus({ kind: "ready", ticket: data.ticket, deepLink: loopbackUrl });
				window.location.href = loopbackUrl;
				return;
			}

			const deepLink = `${DEEP_LINK_BASE}?${params}`;
			setStatus({ kind: "ready", ticket: data.ticket, deepLink });
			window.location.href = deepLink;
		} catch (error) {
			setStatus({
				kind: "error",
				message:
					error instanceof Error ? error.message : "Something went wrong",
			});
		}
	}, [state, callbackPort]);

	useEffect(() => {
		// Guard against React StrictMode double-invoking effects in dev.
		if (started.current) return;
		started.current = true;
		void mintAndOpen();
	}, [mintAndOpen]);

	const copyCode = async () => {
		if (status.kind !== "ready") return;
		await navigator.clipboard.writeText(status.ticket);
		setCopied(true);
	};

	return (
		<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
			{status.kind === "minting" && (
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Preparing your sign-in…
				</div>
			)}

			{status.kind === "error" && (
				<div className="space-y-4">
					<p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{status.message}
					</p>
					<button
						type="button"
						onClick={() => void mintAndOpen()}
						className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
					>
						Try again
					</button>
				</div>
			)}

			{status.kind === "ready" && (
				<div className="space-y-4">
					<div>
						<h1 className="text-lg font-semibold">Opening Kontinue AI…</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							If your browser asks, allow it to open the Kontinue AI app. You
							can close this tab once you're signed in.
						</p>
					</div>

					<a
						href={status.deepLink}
						className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
					>
						<ExternalLink className="size-4" /> Open Kontinue AI
					</a>

					{showCode ? (
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">
								Paste this code into the desktop app. It works once and expires
								in 5 minutes. <strong>Never share it with anyone.</strong>
							</p>
							<div className="flex gap-2">
								<code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
									{status.ticket}
								</code>
								<button
									type="button"
									onClick={() => void copyCode()}
									className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition hover:bg-muted"
								>
									{copied ? (
										<Check className="size-4" />
									) : (
										<Copy className="size-4" />
									)}
									{copied ? "Copied" : "Copy"}
								</button>
							</div>
							<button
								type="button"
								onClick={() => void mintAndOpen()}
								className="text-xs text-muted-foreground underline-offset-4 hover:underline"
							>
								Code expired? Get a new one
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setShowCode(true)}
							className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							App didn't open? Sign in with a code instead
						</button>
					)}
				</div>
			)}

			{email && (
				<p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
					Signed in as <span className="text-foreground">{email}</span>.{" "}
					<SignOutButton redirectUrl={returnTo}>
						<button
							type="button"
							className="underline-offset-4 hover:text-foreground hover:underline"
						>
							Use another account
						</button>
					</SignOutButton>
				</p>
			)}
		</div>
	);
}
