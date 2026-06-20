"use client";

import { Bug, ExternalLink, FileText, Lightbulb, Shield } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type ContactCard = {
	title: string;
	description: string;
	href: string;
	isExternal?: boolean;
	icon: ReactNode;
};

const CONTACT_CARDS: ContactCard[] = [
	{
		title: "Have a feature idea?",
		description: "Share product ideas the team and community can vote on.",
		href: "/feedback",
		icon: <Lightbulb className="size-4" />,
	},
	{
		title: "Found a bug?",
		description:
			"Report issues quickly with clear details and reproduction notes.",
		href: "/feedback",
		icon: <Bug className="size-4" />,
	},
	{
		title: "Privacy Policy",
		description: "How your data is handled.",
		href: "https://kontinueai.com/legal/privacy-policy",
		isExternal: true,
		icon: <Shield className="size-4" />,
	},
	{
		title: "Terms of Service",
		description: "Usage terms and responsibilities.",
		href: "https://kontinueai.com/legal/terms-of-service",
		isExternal: true,
		icon: <FileText className="size-4" />,
	},
];

export function SettingsContactCards() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{CONTACT_CARDS.map((card) => (
				<Link
					key={card.title}
					href={card.href}
					target={card.isExternal ? "_blank" : undefined}
					rel={card.isExternal ? "noopener noreferrer" : undefined}
					className="group surface-card lift-hover rounded-xl p-4 hover:ring-primary/25"
				>
					<div className="flex items-start gap-3">
						<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors group-hover:bg-primary/15">
							{card.icon}
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold text-foreground">
								{card.title}
							</p>
							<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
								{card.description}
							</p>
						</div>
						<ExternalLink className="size-3.5 shrink-0 text-muted-foreground/50 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
					</div>
				</Link>
			))}
		</div>
	);
}
