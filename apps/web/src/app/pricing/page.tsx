"use client";

import { PricingTable } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PricingPage() {
	const router = useRouter();

	return (
		<div className="relative min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30">
			{/* Ambient brand glow */}
			<div className="pointer-events-none absolute left-1/2 top-0 z-0 h-[420px] w-[820px] max-w-[130vw] -translate-x-1/2 rounded-[100%] bg-primary/15 blur-[120px]" />

			<div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-6 py-10 sm:py-16">
				{/* Header */}
				<div className="mb-10 text-center">
					<button
						type="button"
						onClick={() => router.back()}
						className="surface-inset group mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground"
					>
						<ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
						Go back
					</button>
					<p className="eyebrow">Pricing</p>
					<h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
						Pick the right plan for your workflow
					</h1>
					<p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
						Continue your conversations across any platform with powerful tools
						and unlimited history.
					</p>
				</div>

				<main className="relative">
					<PricingTable />
				</main>
			</div>
		</div>
	);
}
