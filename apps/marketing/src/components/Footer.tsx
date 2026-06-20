import Image from "next/image";
import Link from "next/link";
import { ParticleWordmark } from "@/components/ParticleWordmark";
import { APP_URL } from "@/lib/structured-data";

const columns = [
	{
		title: "Product",
		links: [
			{ href: "/#how-it-works", label: "How it works" },
			{ href: "/#features", label: "Features" },
			{ href: "/#pricing", label: "Pricing" },
			{ href: "/#faq", label: "FAQ" },
		],
	},
	{
		title: "Get started",
		links: [
			{ href: "/download", label: "Download app" },
			{ href: `${APP_URL}/sign-up`, label: "Create account", external: true },
			{ href: `${APP_URL}/sign-in`, label: "Sign in", external: true },
			{ href: "mailto:support@kontinueai.com", label: "Contact support" },
		],
	},
	{
		title: "Legal",
		links: [
			{ href: "/legal/privacy-policy", label: "Privacy policy" },
			{ href: "/legal/terms-of-service", label: "Terms of service" },
		],
	},
];

export function Footer() {
	return (
		<footer className="relative overflow-hidden border-t border-border bg-background">
			<div className="relative z-10 mx-auto max-w-6xl px-5 pt-16 lg:px-8 lg:pt-20">
				<div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
					<div className="max-w-xs">
						<Image
							src="/kontinueai.svg"
							alt="Kontinue AI"
							width={128}
							height={30}
							className="h-6 w-auto object-contain"
							style={{ filter: "brightness(0)" }}
						/>
						<p className="mt-5 text-sm leading-relaxed text-muted-foreground">
							Every AI chat in one workspace. Switch models without losing your
							place, and pay for one plan.
						</p>
					</div>

					{columns.map((col) => (
						<div key={col.title}>
							<h2 className="eyebrow mb-5">{col.title}</h2>
							<ul className="space-y-3 text-sm">
								{col.links.map((link) => (
									<li key={link.label}>
										<Link
											href={link.href}
											{...("external" in link && link.external
												? { target: "_blank", rel: "noopener noreferrer" }
												: {})}
											className="text-muted-foreground transition-colors hover:text-foreground"
										>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
					<p>© {new Date().getFullYear()} Kontinue AI. All rights reserved.</p>
					<p className="font-mono uppercase tracking-widest">
						One workspace for every model
					</p>
				</div>
			</div>

			{/* Oversized particle wordmark bleeding off the bottom edge */}
			<div
				aria-hidden
				className="pointer-events-none relative mt-6 select-none overflow-hidden"
			>
				<ParticleWordmark />
			</div>
		</footer>
	);
}
