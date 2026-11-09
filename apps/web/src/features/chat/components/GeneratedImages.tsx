"use client";

import { cn } from "@repo/ui/lib/utils";
import { Download, ImageOff, Maximize2 } from "lucide-react";
import { useState } from "react";
import { downloadImage, ImageLightbox } from "./ImageLightbox";

// Images the ASSISTANT generated: large preview, expand and download.
// The user's own uploads use MessageAttachments instead.
export function GeneratedImages({ images }: { images: string[] }) {
	const [expanded, setExpanded] = useState<number | null>(null);
	if (images.length === 0) return null;

	const single = images.length === 1;
	const expandedSrc = expanded !== null ? images[expanded] : undefined;

	return (
		<>
			<div
				className={cn(
					"not-prose mt-3",
					single
						? "max-w-[min(100%,440px)]"
						: "grid max-w-[560px] grid-cols-2 gap-2",
				)}
			>
				{images.map((src, i) => (
					<GeneratedImageTile
						key={src}
						src={src}
						index={i}
						square={!single}
						onExpand={() => setExpanded(i)}
					/>
				))}
			</div>

			{expanded !== null && expandedSrc && (
				<ImageLightbox
					src={expandedSrc}
					alt={`Generated image ${expanded + 1}`}
					downloadName={`kontinue-image-${expanded + 1}`}
					onClose={() => setExpanded(null)}
				/>
			)}
		</>
	);
}

function GeneratedImageTile({
	src,
	index,
	square,
	onExpand,
}: {
	src: string;
	index: number;
	square: boolean;
	onExpand: () => void;
}) {
	const [state, setState] = useState<"loading" | "ready" | "error">("loading");
	const label = `Generated image ${index + 1}`;

	if (state === "error") {
		return (
			<div
				className={cn(
					"flex flex-col items-center justify-center gap-2 rounded-2xl bg-foreground/[0.03] p-6 text-center ring-1 ring-foreground/10",
					square ? "aspect-square" : "aspect-[4/3]",
				)}
			>
				<ImageOff size={20} className="text-muted-foreground" />
				<p className="text-xs text-muted-foreground">
					This image couldn't be loaded.
				</p>
				<a
					href={src}
					target="_blank"
					rel="noreferrer"
					className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
				>
					Open in new tab
				</a>
			</div>
		);
	}

	const iconButton =
		"flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-2xl bg-foreground/[0.03] ring-1 ring-foreground/10",
				square && "aspect-square",
				state === "loading" && !square && "aspect-square",
			)}
		>
			{state === "loading" && (
				<div className="absolute inset-0 animate-pulse bg-foreground/[0.06]" />
			)}
			<button
				type="button"
				onClick={onExpand}
				aria-label={`Expand ${label.toLowerCase()}`}
				className="block size-full cursor-zoom-in focus-visible:outline-none"
			>
				{/* biome-ignore lint/performance/noImgElement: data: and storage URLs; next/image rejects unlisted hosts */}
				<img
					src={src}
					alt={label}
					referrerPolicy="no-referrer"
					onLoad={() => setState("ready")}
					onError={() => setState("error")}
					className={cn(
						"block size-full transition-opacity duration-300",
						square ? "object-cover" : "h-auto object-contain",
						state === "ready" ? "opacity-100" : "opacity-0",
					)}
				/>
			</button>

			{state === "ready" && (
				<div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-linear-to-t from-black/45 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
					<button
						type="button"
						onClick={onExpand}
						aria-label="Expand"
						title="Expand"
						className={cn(iconButton, "pointer-events-auto")}
					>
						<Maximize2 size={14} />
					</button>
					<button
						type="button"
						onClick={() =>
							void downloadImage(src, `kontinue-image-${index + 1}`)
						}
						aria-label="Download"
						title="Download"
						className={cn(iconButton, "pointer-events-auto")}
					>
						<Download size={14} />
					</button>
				</div>
			)}
		</div>
	);
}
