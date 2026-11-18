"use client";

// "Download for Mac / Windows / Linux": picks the visitor's system, links to
// /download/<platform> (which redirects to the latest installer, so the
// download starts in place) and lists the other systems underneath.

import { track } from "@vercel/analytics";
import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { OsIcon } from "@/components/marketing/OsIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Os = "mac" | "windows" | "linux" | "mobile" | "unknown";

const LABEL: Record<"mac" | "windows" | "linux", string> = {
	mac: "Mac",
	windows: "Windows",
	linux: "Linux",
};

function detectOs(): Os {
	const nav = navigator as Navigator & {
		userAgentData?: { platform?: string; mobile?: boolean };
	};
	if (nav.userAgentData?.mobile) return "mobile";
	const platform = (
		nav.userAgentData?.platform ||
		nav.platform ||
		""
	).toLowerCase();
	const ua = nav.userAgent.toLowerCase();
	if (/iphone|ipad|ipod|android/.test(ua)) return "mobile";
	// iPadOS reports itself as a Mac; touch gives it away.
	if (platform.includes("mac") || ua.includes("mac os"))
		return nav.maxTouchPoints > 1 ? "mobile" : "mac";
	if (platform.includes("win") || ua.includes("windows")) return "windows";
	if (platform.includes("linux") || ua.includes("linux")) return "linux";
	return "unknown";
}

export function DesktopDownloadButton({
	version,
	downloads,
	className,
	align = "center",
	secondary,
	location,
}: {
	version: string | null;
	/** Already formatted ("20k"), or null to hide the count. */
	downloads: string | null;
	className?: string;
	align?: "center" | "start";
	/** Another action shown beside the download button (the homepage's web link). */
	secondary?: ReactNode;
	/** Where the button sits, for analytics. */
	location: string;
}) {
	const [os, setOs] = useState<Os>("unknown");
	useEffect(() => setOs(detectOs()), []);

	const target = os === "windows" || os === "linux" ? os : "mac";
	const others = (["mac", "windows", "linux"] as const).filter(
		(item) => item !== target,
	);

	return (
		<div
			className={cn(
				"flex flex-col gap-3",
				align === "center" ? "items-center text-center" : "items-start",
				className,
			)}
		>
			<div
				className={cn(
					"flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row",
					align === "start" && "sm:items-start",
				)}
			>
				{os === "mobile" ? (
					<p className="max-w-sm text-sm text-muted-foreground">
						The desktop app is for Mac, Windows and Linux. Open this page on
						your computer to download it.
					</p>
				) : (
					<Button asChild size="lg" className="w-full sm:w-auto">
						<a
							href={`/download/${target}`}
							download
							onClick={() =>
								track("desktop_download_clicked", {
									platform: target,
									location,
								})
							}
						>
							<OsIcon os={target} className="size-[1.1rem]" />
							Download for {LABEL[target]}
						</a>
					</Button>
				)}
				{secondary}
			</div>

			<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
				{version ? (
					<a
						href={`https://github.com/colesites/kontinueai/releases/tag/desktop-v${version}`}
						target="_blank"
						rel="noopener noreferrer"
						title="Release notes on GitHub"
						className="inline-flex items-center gap-0.5 font-mono text-[12px] transition-colors hover:text-foreground"
					>
						v{version}
						<ArrowUpRight className="size-3" />
					</a>
				) : null}
				<span className="rounded-full border border-border px-2 py-px text-[11px] font-semibold tracking-wide uppercase">
					Alpha
				</span>
				{downloads ? (
					<>
						<span aria-hidden>·</span>
						<span>{downloads} downloads</span>
					</>
				) : null}
			</p>

			{/* One flex row so the icons sit on the same line as the words. */}
			<p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-muted-foreground">
				<span>Also for</span>
				{others.map((item, index) => (
					<span key={item} className="inline-flex items-center gap-1.5">
						{index > 0 ? <span>and</span> : null}
						<a
							href={`/download/${item}`}
							download
							onClick={() =>
								track("desktop_download_clicked", { platform: item, location })
							}
							className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline"
						>
							<OsIcon os={item} className="size-3.5 shrink-0" />
							{LABEL[item]}
						</a>
					</span>
				))}
			</p>
		</div>
	);
}
