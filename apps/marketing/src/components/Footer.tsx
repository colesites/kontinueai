import Image from "next/image";
import Link from "next/link";
import { ParticleWordmark } from "@/components/ParticleWordmark";
import { appLinks, product } from "@/data/product";

const columns = [
	{
		title: "Product",
		links: [
			{ href: "/kontinue-model", label: "K-AI 1.0" },
			{ href: "/import-ai-conversations", label: "Import conversations" },
			{ href: "/supported-models", label: "Supported models" },
			{ href: "/pricing", label: "Pricing" },
		],
	},
	{
		title: "Company",
		links: [
			{ href: "/about", label: "About" },
			{ href: "/blog", label: "Blog" },
			{ href: "/press", label: "Press" },
			{ href: "/security", label: "Security & privacy" },
		],
	},
	{
		title: "Get started",
		links: [
			{ href: "/download", label: "Download" },
			{ href: appLinks.signUp, label: "Create account", external: true },
			{ href: appLinks.signIn, label: "Sign in", external: true },
			{ href: "/legal/privacy-policy", label: "Privacy policy" },
			{ href: "/legal/terms-of-service", label: "Terms of service" },
		],
	},
];

export function Footer() {
	return (
		<footer className="relative overflow-hidden border-t border-border bg-background">
			<div className="relative z-10 mx-auto max-w-6xl px-5 pt-16 lg:px-8 lg:pt-20">
				<div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))]">
					<div className="max-w-xs">
						<Image
							src="/kontinueai.svg"
							alt="Kontinue AI"
							width={128}
							height={30}
							className="h-6 w-auto object-contain"
							style={{ filter: "brightness(0)", width: "auto" }}
						/>
						<p className="mt-5 text-sm leading-relaxed text-muted-foreground">
							{product.positioning.short} {product.company.originStatement}.
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

					<div>
						<h2 className="eyebrow mb-5">Contact</h2>
						<a
							href={`mailto:${product.company.email.general}`}
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							{product.company.email.general}
						</a>
						<div className="mt-5 flex items-center gap-2">
							{product.company.socialLinks.map((social) => (
								<a
									key={social.name}
									href={social.href}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Follow Kontinue AI on ${social.name}`}
									title={social.name}
									className="inline-flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-foreground/25 hover:bg-accent hover:text-foreground"
								>
									<Image
										aria-hidden
										src={social.icon}
										alt=""
										width={18}
										height={18}
										className="size-[1.1rem] object-contain"
									/>
								</a>
							))}
						</div>
					</div>
				</div>

				<div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
					<p>© {new Date().getFullYear()} Kontinue AI. All rights reserved.</p>
					<p className="font-mono uppercase tracking-widest">
						Built in Africa for the world
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
