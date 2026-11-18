import { ArrowUpRight, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/anim/Reveal";
import { DesktopDownloadButton } from "@/components/marketing/DesktopDownloadButton";
import { JsonLd } from "@/components/marketing/JsonLd";
import { OsIcon, type OsName } from "@/components/marketing/OsIcon";
import {
	type DesktopPlatform,
	type DesktopRelease,
	formatDownloads,
	getDesktopRelease,
	RELEASES_URL,
	SHOW_DOWNLOADS_FROM,
} from "@/lib/desktop-release";
import { pageMetadata, SITE_URL } from "@/lib/metadata";

// Picks up a new release within 15 minutes of it being published.
export const revalidate = 900;

export const metadata: Metadata = pageMetadata({
	title: "Download Kontinue AI for Mac, Windows and Linux",
	description:
		"Download Kontinue AI for Mac, Windows and Linux. Chat with every major model and continue Claude Code and Codex sessions when you hit a limit.",
	path: "/download",
});

type Build = { platform: DesktopPlatform; title: string; kind: string };

/** One section per system: its installers, and what to do the first time. */
const SYSTEMS: {
	os: OsName;
	name: string;
	builds: Build[];
	firstTime: string;
}[] = [
	{
		os: "mac",
		name: "macOS",
		builds: [
			{ platform: "mac", title: "Apple silicon and Intel", kind: ".dmg" },
		],
		firstTime:
			'First time: drag Kontinue AI to Applications, then right-click it and choose Open. If macOS says it is damaged, run xattr -cr "/Applications/Kontinue AI.app" in Terminal.',
	},
	{
		os: "windows",
		name: "Windows",
		builds: [{ platform: "windows", title: "Windows 10, 11", kind: ".exe" }],
		firstTime:
			"First time: if Windows says it protected your PC, choose More info, then Run anyway.",
	},
	{
		os: "linux",
		name: "Linux",
		builds: [
			{ platform: "linux-deb", title: "Debian, Ubuntu", kind: ".deb" },
			{ platform: "linux-rpm", title: "Fedora, openSUSE", kind: ".rpm" },
			{ platform: "linux", title: "Any distro (x86_64)", kind: "AppImage" },
		],
		firstTime: "For the AppImage, mark it executable (chmod +x) and run it.",
	},
];

function megabytes(bytes: number | undefined) {
	return bytes ? `${Math.round(bytes / 1_000_000)} MB` : null;
}

function SectionTitle({
	icon,
	children,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<h2 className="flex items-center gap-2.5 border-b border-border pb-3 font-display text-xl tracking-tight">
			<span className="text-foreground">{icon}</span>
			{children}
		</h2>
	);
}

function BuildCard({
	build,
	release,
}: {
	build: Build;
	release: DesktopRelease | null;
}) {
	const size = megabytes(release?.files[build.platform]?.size);
	return (
		<a
			href={`/download/${build.platform}`}
			download
			className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-foreground/20 hover:bg-accent"
		>
			<Image
				src="/kontinueai-icon.png"
				alt=""
				width={36}
				height={36}
				className="size-9 shrink-0 rounded-[10px] border border-border bg-background object-contain p-1.5"
			/>
			<span className="min-w-0">
				<span className="block font-medium text-foreground">{build.title}</span>
				<span className="block text-sm text-muted-foreground">
					{build.kind}
					{size ? ` · ${size}` : ""}
				</span>
			</span>
		</a>
	);
}

export default async function DownloadPage() {
	const release = await getDesktopRelease();
	const downloads =
		release && release.totalDownloads >= SHOW_DOWNLOADS_FROM
			? formatDownloads(release.totalDownloads)
			: null;

	// The desktop app as a downloadable product, for search results and AI answers.
	const appSchema = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Kontinue AI for desktop",
		applicationCategory: "BusinessApplication",
		applicationSubCategory: "AI assistant",
		operatingSystem: "macOS, Windows 10, Windows 11, Linux",
		...(release ? { softwareVersion: release.version } : {}),
		...(release?.publishedAt
			? { datePublished: release.publishedAt.slice(0, 10) }
			: {}),
		downloadUrl: `${SITE_URL}/download`,
		url: `${SITE_URL}/download`,
		description:
			"Desktop app for Kontinue AI: chat with every major model, and continue Claude Code and Codex coding sessions when they hit a usage limit.",
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		publisher: { "@id": `${SITE_URL}/#organization` },
	};

	return (
		<>
			<JsonLd data={appSchema} />
			{/* Hero: headline and the download button. */}
			<section className="relative overflow-hidden px-5 pt-32 pb-0 lg:px-8 lg:pt-40">
				<div
					aria-hidden
					className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-50"
				/>

				<div className="relative mx-auto max-w-3xl text-center">
					<Reveal>
						<p className="eyebrow inline-flex items-center gap-2">
							<span className="size-1.5 rounded-full bg-brand" />
							Desktop app, now in alpha
						</p>
						<h1 className="font-display tracking-tightest mx-auto mt-6 text-[2.75rem] leading-[1.02] sm:text-7xl">
							Every model. <br />
							Every agent. One app.
						</h1>
						<p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
							Chat with Claude, GPT, Gemini and more, and code with Kode. Hit a
							limit in Claude Code or Codex and pick the project up right where
							it stopped.
						</p>
					</Reveal>

					<Reveal className="mt-10">
						<DesktopDownloadButton
							location="download_page"
							version={release?.version ?? null}
							downloads={downloads}
						/>
					</Reveal>
				</div>
			</section>

			<section className="px-5 pt-16 pb-24 lg:px-8 lg:pb-32">
				<div className="mx-auto max-w-3xl space-y-12">
					{SYSTEMS.map((system) => (
						<Reveal key={system.os}>
							<SectionTitle
								icon={<OsIcon os={system.os} className="size-[18px]" />}
							>
								{system.name}
							</SectionTitle>
							<div className="mt-4 grid gap-3 sm:grid-cols-2">
								{system.builds.map((build) => (
									<BuildCard
										key={build.platform}
										build={build}
										release={release}
									/>
								))}
							</div>
							<p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
								{system.firstTime}
							</p>
						</Reveal>
					))}

					<Reveal>
						<SectionTitle
							icon={<Smartphone className="size-[18px]" strokeWidth={1.75} />}
						>
							Mobile
						</SectionTitle>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							{[
								{ name: "iPhone and iPad", store: "App Store" },
								{ name: "Android", store: "Google Play" },
							].map((app) => (
								<div
									key={app.name}
									className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3.5"
								>
									<span>
										<span className="block font-medium text-foreground/80">
											{app.name}
										</span>
										<span className="block text-sm text-muted-foreground">
											{app.store}
										</span>
									</span>
									<span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
										Coming soon
									</span>
								</div>
							))}
						</div>
					</Reveal>

					<Reveal className="space-y-3 border-t border-border pt-8 text-center text-sm text-muted-foreground">
						<p>
							Kontinue AI for desktop is in alpha. Features may change and some
							things may break, and installed copies update themselves as fixes
							ship.
						</p>
						<p>
							All builds are on the{" "}
							<a
								href={RELEASES_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-0.5 font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
							>
								GitHub releases page
								<ArrowUpRight className="size-3.5" />
							</a>
						</p>
					</Reveal>
				</div>
			</section>
		</>
	);
}
