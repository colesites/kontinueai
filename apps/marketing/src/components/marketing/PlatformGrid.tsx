import { ArrowRight, ArrowUpRight, Globe, Monitor } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { appLinks } from "@/data/product";

interface Platform {
	id: string;
	name: string;
	description: string;
	available: boolean;
	icon: React.ReactNode;
	action?: { label: string; href: string; external?: boolean };
}

const platforms: Platform[] = [
	{
		id: "web",
		name: "Web",
		description: "Works in any modern browser. Nothing to install.",
		available: true,
		icon: <Globe className="size-5" strokeWidth={1.75} />,
		action: { label: "Open Kontinue", href: appLinks.import, external: true },
	},
	{
		id: "desktop",
		name: "Desktop",
		description:
			"Import Claude Code and Codex projects when you hit a rate limit.",
		available: false,
		icon: <Monitor className="size-5" strokeWidth={1.75} />,
		action: { label: "About the desktop app", href: "/desktop-waitlist" },
	},
	{
		id: "ios",
		name: "iPhone and iPad",
		description: "Your chats, models and imports, wherever you are.",
		available: false,
		icon: (
			<Image
				src="/apple.svg"
				alt=""
				width={20}
				height={20}
				className="h-5 w-auto object-contain [.surface-dark_&]:invert"
			/>
		),
	},
	{
		id: "android",
		name: "Android",
		description: "The same Kontinue, built for Android phones and tablets.",
		available: false,
		icon: (
			<Image
				src="/android.svg"
				alt=""
				width={20}
				height={20}
				className="size-5 object-contain"
			/>
		),
	},
];

/** Platform availability tiles, shared by the homepage and /download. */
export function PlatformGrid() {
	return (
		<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{platforms.map((platform) => (
				<li
					key={platform.id}
					className="flex flex-col rounded-2xl border border-border bg-card p-6"
				>
					<div className="flex items-center justify-between gap-3">
						<span className="grid size-10 place-items-center rounded-xl border border-border bg-background">
							{platform.icon}
						</span>
						{platform.available ? (
							<span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background">
								<span className="size-1.5 rounded-full bg-emerald-400" />
								Available
							</span>
						) : (
							<span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
								Coming soon
							</span>
						)}
					</div>

					<h3 className="font-display mt-5 text-xl tracking-tight">
						{platform.name}
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						{platform.description}
					</p>

					{platform.action ? (
						<Link
							href={platform.action.href}
							{...(platform.action.external
								? { target: "_blank", rel: "noopener noreferrer" }
								: {})}
							className="group mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-brand-strong"
						>
							{platform.action.label}
							{platform.action.external ? (
								<ArrowUpRight className="size-4" />
							) : (
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
							)}
						</Link>
					) : null}
				</li>
			))}
		</ul>
	);
}
