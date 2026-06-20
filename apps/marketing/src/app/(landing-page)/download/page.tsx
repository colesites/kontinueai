import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/structured-data";

export const metadata: Metadata = {
	title: "Download the app",
	description:
		"Kontinue AI for Android, iPhone and iPad is coming soon. Keep using it on the web in the meantime.",
	alternates: { canonical: "/download" },
	openGraph: {
		title: "Download Kontinue AI",
		description:
			"Kontinue AI for Android, iPhone and iPad is coming soon. Use it on the web in the meantime.",
		url: "/download",
	},
};

export default function DownloadPage() {
	return (
		<section className="bg-noise relative overflow-hidden px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-32">
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-60"
			/>

			<div className="relative mx-auto max-w-4xl">
				<Reveal className="text-center">
					<p className="eyebrow inline-flex items-center gap-2">
						<span className="size-1.5 rounded-full bg-brand" />
						Get the app
					</p>
					<h1 className="font-display tracking-tightest mx-auto mt-6 max-w-2xl text-[2.5rem] leading-[1.04] sm:text-6xl">
						Take Kontinue AI anywhere
					</h1>
					<p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
						Your conversations, models and imports in your pocket. The Android,
						iPhone and iPad apps are on the way.
					</p>
				</Reveal>

				<Reveal
					stagger={0.12}
					className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-2"
				>
					{/* Android */}
					<div
						data-anim
						className="flex h-full flex-col rounded-[1.4rem] border border-border bg-card p-7 sm:p-8"
					>
						<span className="grid size-12 place-items-center rounded-xl border border-border bg-background">
							<Image
								src="/android.svg"
								alt=""
								width={26}
								height={26}
								className="size-6 object-contain"
							/>
						</span>
						<div className="mt-5 flex items-center gap-2.5">
							<h2 className="font-display text-2xl tracking-tight">Android</h2>
							<span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-strong">
								Soon
							</span>
						</div>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							The Android build is in the works. Use the web app in the meantime,
							it works great on Android.
						</p>

						<div className="grow" />

						<Button
							type="button"
							variant="outline"
							size="lg"
							disabled
							className="mt-7 w-full"
						>
							Coming soon
						</Button>
					</div>

					{/* iOS */}
					<div
						data-anim
						className="flex h-full flex-col rounded-[1.4rem] border border-border bg-card p-7 sm:p-8"
					>
						<span className="grid size-12 place-items-center rounded-xl border border-border bg-background">
							<Image
								src="/apple.svg"
								alt=""
								width={24}
								height={24}
								className="h-6 w-auto object-contain"
							/>
						</span>
						<div className="mt-5 flex items-center gap-2.5">
							<h2 className="font-display text-2xl tracking-tight">
								iPhone and iPad
							</h2>
							<span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-strong">
								Soon
							</span>
						</div>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							The App Store release is in the works. Use the web app in the
							meantime, it works great on iOS.
						</p>

						<div className="grow" />

						<Button
							type="button"
							variant="outline"
							size="lg"
							disabled
							className="mt-7 w-full"
						>
							Coming soon
						</Button>
					</div>
				</Reveal>

				<Reveal className="mt-12 text-center">
					<Link
						href={APP_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						Prefer the browser? Open Kontinue AI on the web
						<ArrowRight className="size-4" />
					</Link>
				</Reveal>
			</div>
		</section>
	);
}
