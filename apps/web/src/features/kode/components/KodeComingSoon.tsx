import Link from "next/link";

export function KodeComingSoon() {
	return (
		<div className="flex min-h-full items-center justify-center bg-[oklch(0.145_0.01_345)] px-5 py-20 text-white">
			<section className="max-w-lg text-center">
				<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">
					Kode
				</p>
				<h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
					Coming soon
				</h1>
				<p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/45 sm:text-base">
					We’re preparing Kode for its first production release. It will be
					available to Pro members when it launches.
				</p>
				<Link
					href="/"
					className="mt-7 inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
				>
					Return to chat
				</Link>
			</section>
		</div>
	);
}
