"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "success" | "error";

export function NewsletterForm() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [message, setMessage] = useState("");

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (status === "loading") return;
		setStatus("loading");
		setMessage("");

		try {
			const res = await fetch("/api/newsletter", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await res.json().catch(() => ({}))) as {
				ok?: boolean;
				error?: string;
			};

			if (res.ok && data.ok) {
				setStatus("success");
				setMessage("You're on the list — see you in your inbox.");
				setEmail("");
			} else {
				setStatus("error");
				setMessage(data.error ?? "Could not subscribe. Try again.");
			}
		} catch {
			setStatus("error");
			setMessage("Network error. Try again.");
		}
	};

	return (
		<div className="w-full max-w-md">
			<form onSubmit={submit} className="flex items-center gap-2">
				<input
					type="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="you@work.com"
					aria-label="Email address"
					className="w-full rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/30"
				/>
				<button
					type="submit"
					disabled={status === "loading"}
					className="shrink-0 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
				>
					{status === "loading" ? "Joining…" : "Subscribe"}
				</button>
			</form>
			{message && (
				<p
					className={cn(
						"mt-3 text-sm",
						status === "success" ? "text-white/80" : "text-red-300",
					)}
					aria-live="polite"
				>
					{message}
				</p>
			)}
		</div>
	);
}
