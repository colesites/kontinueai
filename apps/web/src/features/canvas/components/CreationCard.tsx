"use client";

import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { Expand, Heart, Play, Share2 } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { toast } from "sonner";

export interface CreationData {
	_id: Id<"canvasCreations">;
	mediaType: "image" | "video";
	mediaUrl: string;
	prompt: string;
	modelId: string;
	aspectRatio: string;
	duration?: number;
	ownerName?: string;
	ownerImageUrl?: string;
	likeCount: number;
	isPublished: boolean;
	createdAt: number;
}

interface CreationCardProps {
	creation: CreationData;
	isLiked: boolean;
	onToggleLike: (id: Id<"canvasCreations">) => void;
	onExpand: (creation: CreationData) => void;
}

export function CreationCard({
	creation,
	isLiked,
	onToggleLike,
	onExpand,
}: CreationCardProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	const handleMouseEnter = () => {
		if (creation.mediaType === "video" && videoRef.current) {
			videoRef.current.play().catch(() => undefined);
		}
	};

	const handleMouseLeave = () => {
		if (creation.mediaType === "video" && videoRef.current) {
			videoRef.current.pause();
			videoRef.current.currentTime = 0;
		}
	};

	return (
		<div className="group relative cursor-pointer overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/8 shadow-[0_2px_10px_-6px_color-mix(in_oklch,black_40%,transparent)] transition-all duration-300 break-inside-avoid hover:-translate-y-0.5 hover:ring-primary/35 hover:shadow-[0_16px_44px_-18px_color-mix(in_oklch,var(--primary)_45%,transparent)]">
			<button
				type="button"
				aria-label={`Open creation: ${creation.prompt}`}
				className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
				onClick={() => onExpand(creation)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onFocus={handleMouseEnter}
				onBlur={handleMouseLeave}
			/>
			{/* Media */}
			<div className="relative">
				{creation.mediaType === "image" ? (
					<div className="relative">
						<Image
							src={creation.mediaUrl}
							alt={creation.prompt}
							width={800}
							height={1200}
							unoptimized
							className="h-auto w-full object-cover"
						/>
					</div>
				) : (
					<div className="relative">
						<video
							ref={videoRef}
							src={creation.mediaUrl}
							muted
							loop
							playsInline
							preload="metadata"
							className="h-auto w-full object-cover"
							onLoadedData={(e) => {
								// Pause at first frame so it renders as a thumbnail
								const video = e.currentTarget;
								video.currentTime = 0.1;
								video.pause();
							}}
						/>
						{/* Play indicator */}
						<div className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
							<div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
								<Play className="h-5 w-5 fill-current" />
							</div>
						</div>
					</div>
				)}

				{/* Global Shading Overlay (Visible on hover) */}
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />

				{/* Info Overlays */}
				<div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between pointer-events-none">
					{/* Bottom Left: Owner Name */}
					<div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
						<span className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md">
							{creation.ownerName || "Anonymous"}
						</span>
					</div>

					{/* Bottom Right: Actions */}
					<div className="relative z-20 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
						<button
							type="button"
							className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/55 shadow-lg"
							onClick={(e) => {
								e.stopPropagation();
								const url = new URL(window.location.href);
								url.searchParams.set("id", creation._id);
								navigator.clipboard.writeText(url.toString());
								toast.success("Link copied to clipboard!");
							}}
						>
							<Share2 className="h-4 w-4" />
						</button>
						<button
							type="button"
							className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/55 shadow-lg"
							onClick={(e) => {
								e.stopPropagation();
								onExpand(creation);
							}}
						>
							<Expand className="h-4 w-4" />
						</button>
						<button
							type="button"
							className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/55 shadow-lg"
							onClick={(e) => {
								e.stopPropagation();
								onToggleLike(creation._id);
							}}
						>
							<Heart
								className={`h-4 w-4 ${
									isLiked ? "fill-destructive text-destructive" : ""
								}`}
							/>
						</button>
						{creation.likeCount > 0 && (
							<span className="text-[11px] font-semibold text-white drop-shadow-lg">
								{creation.likeCount}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
