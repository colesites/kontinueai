import { ArrowRight, Code2, FolderGit2, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { DesktopWaitlistForm } from "@/components/marketing/DesktopWaitlistForm";
import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
	title: "Kontinue AI Desktop Waitlist",
	description:
		"Join the waitlist for Kontinue AI Desktop — the first desktop app to import your Claude Code and Codex projects when you hit rate limits.",
	path: "/desktop-waitlist",
});

const highlights = [
	{
		icon: Code2,
		title: "Claude Code & Codex",
		description:
			"Import local coding sessions with their conversation, tool activity and latest task.",
	},
	{
		icon: FolderGit2,
		title: "Real project context",
		description:
			"Keep the actual repo, git state, instructions and files the agent needs to continue.",
	},
	{
		icon: LockKeyhole,
		title: "Local-first by default",
		description:
			"Secrets are redacted before upload. Project context stays on your machine.",
	},
];

export default function DesktopWaitlistPage() {
	return (
		<section className="bg-noise relative overflow-hidden px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-32">
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-60"
			/>

			<div className="relative mx-auto max-w-5xl">
				<Reveal className="text-center">
					<p className="eyebrow inline-flex items-center gap-2">
						<span className="size-1.5 rounded-full bg-brand" />
						Desktop waitlist
					</p>
					<h1 className="font-display tracking-tightest mx-auto mt-6 max-w-3xl text-[2.5rem] leading-[1.03] sm:text-6xl">
						Kontinue AI Desktop is coming soon
					</h1>
					<p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
						The 1st desktop app to import your Claude Code &amp; Codex projects
						when you hit rate limits.
					</p>
				</Reveal>

				<div className="mt-14 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
					<Reveal className="card-shadow rounded-[1.6rem] border border-border bg-card p-7 sm:p-9">
						<p className="eyebrow text-brand-strong">Early access</p>
						<h2 className="font-display mt-3 text-3xl tracking-tight">
							Get the first invite
						</h2>
						<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
							Join the list and we&apos;ll email you when the desktop app is
							ready for your projects. No spam, just the launch.
						</p>
						<div className="mt-7">
							<DesktopWaitlistForm />
						</div>
					</Reveal>

					<Reveal stagger={0.1} className="grid gap-4">
						{highlights.map((item) => {
							const Icon = item.icon;
							return (
								<div
									key={item.title}
									data-anim
									className="rounded-[1.3rem] border border-border bg-card p-5"
								>
									<span className="grid size-9 place-items-center rounded-xl border border-border bg-background text-brand">
										<Icon className="size-4" />
									</span>
									<h3 className="font-display mt-4 text-lg tracking-tight">
										{item.title}
									</h3>
									<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
										{item.description}
									</p>
								</div>
							);
						})}

						<div
							data-anim
							className="bg-noise relative overflow-hidden rounded-[1.3rem] bg-foreground p-6 text-background"
						>
							<div
								aria-hidden
								className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-[0.12] invert"
							/>
							<div className="relative">
								<p className="font-mono text-[10px] uppercase tracking-[0.22em] text-background/55">
									Built for the limit
								</p>
								<p className="font-display mt-3 text-2xl leading-[1.1] tracking-tight">
									Don&apos;t start over when Claude Code or Codex stops.
								</p>
							</div>
						</div>
					</Reveal>
				</div>

				<Reveal className="mt-12 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row">
					<Button asChild variant="outline" size="sm">
						<Link href="/download">
							See the mobile apps
							<ArrowRight className="size-4" />
						</Link>
					</Button>
					<Link
						href="/import-claude-conversations"
						className="link-underline text-muted-foreground transition-colors hover:text-foreground"
					>
						Import a Claude conversation today
					</Link>
				</Reveal>
			</div>
		</section>
	);
}
