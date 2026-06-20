import { ArrowRight, Braces, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

export function KodeAccessGate() {
	return (
		<div className="flex min-h-full items-center justify-center bg-background px-5 py-20">
			<section className="w-full max-w-xl rounded-[2rem] border border-foreground/10 bg-background p-7 text-center shadow-2xl sm:p-10">
				<div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_40px_-12px_color-mix(in_oklch,var(--primary)_70%,transparent)]">
					<LockKeyhole className="size-6" />
				</div>
				<div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
					<Sparkles className="size-3.5" />
					Pro workspace
				</div>
				<h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
					Build working web apps with Kode
				</h1>
				<p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
					Kode turns an idea into an editable, interactive web project. It is
					available exclusively to Kontinue Pro members and includes a separate,
					token-metered monthly allowance.
				</p>
				<div className="mt-7 grid grid-cols-3 gap-2 text-left text-xs text-muted-foreground">
					{[
						["25K", "tokens per credit"],
						["Live", "app preview"],
						["Full", "source access"],
					].map(([value, label]) => (
						<div
							key={label}
							className="rounded-2xl border border-foreground/8 bg-foreground/[0.035] p-3"
						>
							<div className="text-base font-semibold text-foreground">
								{value}
							</div>
							<div className="mt-0.5">{label}</div>
						</div>
					))}
				</div>
				<Link
					href="/pricing"
					className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
				>
					<Braces className="size-4" />
					Upgrade to Pro
					<ArrowRight className="size-4" />
				</Link>
			</section>
		</div>
	);
}
