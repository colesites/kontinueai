"use client";

import { Info, Link2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { HowToStep } from "./HowToStep";

const STORAGE_KEY = "continue-ai-how-to-seen";

export function HowToModal() {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		const seen = localStorage.getItem(STORAGE_KEY);
		if (!seen) {
			// Avoid setState synchronously inside the effect body (repo lint rule).
			const t = setTimeout(() => setIsOpen(true), 0);
			return () => clearTimeout(t);
		}
	}, []);

	const handleClose = () => {
		localStorage.setItem(STORAGE_KEY, "true");
		setIsOpen(false);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop */}
			<button
				type="button"
				aria-label="Close import instructions"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
				onClick={handleClose}
			/>

			{/* Modal */}
			<div className="glass-strong animate-fade-in-up relative w-full max-w-lg overflow-hidden rounded-2xl">
				{/* Accent bar */}
				<div className="h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

				<div className="p-7">
					{/* Close button */}
					<button
						type="button"
						onClick={handleClose}
						aria-label="Close"
						className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full bg-foreground/5 text-muted-foreground ring-1 ring-foreground/8 transition-all duration-200 hover:scale-105 hover:bg-foreground/10 hover:text-foreground"
					>
						<X size={16} />
					</button>

					{/* Title */}
					<div className="mb-7 text-center">
						<div className="relative mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20 shadow-[0_8px_24px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)]">
							<div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-primary/25 blur-xl" />
							<Sparkles size={26} />
						</div>
						<p className="eyebrow">Welcome</p>
						<h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
							Welcome to Kontinue AI
						</h2>
						<p className="mt-2 text-sm text-muted-foreground">
							Pick up where you left off with any AI conversation.
						</p>
					</div>

					{/* Steps */}
					<div className="mb-6 space-y-4">
						<HowToStep
							icon={<Sparkles size={18} />}
							title="Continue with any model"
							description="Pick GPT, Claude, or Gemini (via AI Gateway) and keep going."
						/>

						<HowToStep
							icon={<Link2 size={18} />}
							title="Paste a shared link"
							description="We'll automatically scrape the conversation from ChatGPT, Claude, or Gemini."
						/>
					</div>

					{/* Tip */}
					<div className="surface-inset mb-6 flex items-start gap-3 rounded-xl p-3.5">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
							<Info size={15} />
						</span>
						<div className="text-sm">
							<p className="font-medium text-foreground">Pro tip</p>
							<p className="mt-1 leading-relaxed text-muted-foreground">
								You can import shared links from multiple providers. Just paste
								the URL and we handle the rest.
							</p>
						</div>
					</div>

					{/* CTA */}
					<button
						type="button"
						onClick={handleClose}
						className="glow-button w-full rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
					>
						Get started
					</button>
				</div>
			</div>
		</div>
	);
}
