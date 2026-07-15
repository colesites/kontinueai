"use client";

import { IMAGE_MODELS, VIDEO_MODELS } from "@repo/ai/lib/canvas-models";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import { usePlanTier } from "@web/lib/use-plan-tier";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CreationData } from "../components/CreationCard";

import { useCanvasContext } from "../contexts/CanvasContext";

const PAGE_SIZE = 18;

export function useCanvas() {
	const planTier = usePlanTier();
	const searchParams = useSearchParams();
	const shareId = searchParams.get("id");
	const isPro = canAccessPlanFeature(planTier, "canvas");
	const canGenerateImages = isPro;

	const [isGenerating, setIsGenerating] = useState(false);
	const [publishingIds, setPublishingIds] = useState<
		Set<Id<"canvasCreations">>
	>(new Set());
	const [expandedCreationId, setExpandedCreationId] = useState<string | null>(
		() => shareId,
	);
	const { tab, setTab } = useCanvasContext();
	// Active long-form K-Video render job (drives the progress loader).
	const [activeVideoJobId, setActiveVideoJobId] =
		useState<Id<"videoJobs"> | null>(null);

	// Convex paginated queries
	const {
		results: publishedResults,
		status: publishedStatus,
		loadMore: loadMorePublished,
	} = usePaginatedQuery(
		api.canvas.listPublished,
		{ sortBy: "likes" },
		{ initialNumItems: PAGE_SIZE },
	);

	const {
		results: myResults,
		status: myStatus,
		loadMore: loadMoreMy,
	} = usePaginatedQuery(
		api.canvas.listMyCreations,
		{},
		{ initialNumItems: PAGE_SIZE },
	);

	const publishedCreations = publishedResults as CreationData[] | undefined;
	const myCreations = myResults as CreationData[] | undefined;

	const expandedCreation = useMemo(() => {
		if (!expandedCreationId) return null;
		return (
			publishedCreations?.find((item) => item._id === expandedCreationId) ??
			myCreations?.find((item) => item._id === expandedCreationId) ??
			null
		);
	}, [expandedCreationId, publishedCreations, myCreations]);
	const setExpandedCreation = useCallback((creation: CreationData | null) => {
		setExpandedCreationId(creation?._id ?? null);
	}, []);

	const credits = useQuery(api.canvas.getCredits);
	const myLikesRaw = useQuery(api.canvas.getMyLikes);

	// Video unlocks for Pro (monthly allowance) OR anyone holding referral-bonus
	// credits — the latter is what lets a free/Starter inviter generate video at
	// all, until the gift runs out.
	const bonusRemaining = credits?.bonus?.remaining ?? 0;
	const canGenerateVideos = isPro || bonusRemaining > 0;

	// Convex mutations
	const createCreation = useMutation(api.canvas.createCreation);
	const toggleLikeMutation = useMutation(api.canvas.toggleLike);
	const publishMutation = useMutation(api.canvas.publishCreation);

	const myLikes = useMemo(() => {
		return myLikesRaw
			? new Set(
					Array.isArray(myLikesRaw)
						? (myLikesRaw as Id<"canvasCreations">[])
						: [],
				)
			: new Set<Id<"canvasCreations">>();
	}, [myLikesRaw]);

	// Sync expandedCreation state back to the URL (using replaceState to avoid flickering)
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const currentId = params.get("id");
		const newId = expandedCreationId;

		if (newId !== currentId) {
			if (newId) {
				params.set("id", newId);
			} else {
				params.delete("id");
			}
			const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
			window.history.replaceState(
				{ ...window.history.state, as: newUrl, url: newUrl },
				"",
				newUrl,
			);
		}
	}, [expandedCreationId]);

	const handleGenerate = useCallback(
		async (opts: {
			prompt: string;
			mode: "image" | "video";
			model: string;
			aspectRatio: string;
			duration?: number;
			quality?: "standard" | "pro";
			audio?: boolean;
			resolution?: string;
			imageUrl?: string;
		}) => {
			if (isGenerating) return;

			const currentModel = [...IMAGE_MODELS, ...VIDEO_MODELS].find(
				(m) => m.id === opts.model,
			);
			const isFree = currentModel?.isFree || false;

			if (opts.mode === "image" && !canGenerateImages && !isFree) {
				toast.error("Upgrade to Starter or Pro to generate images.");
				return;
			}
			if (opts.mode === "video" && !canGenerateVideos && !isFree) {
				toast.error("Upgrade to Pro to generate videos.");
				return;
			}

			setIsGenerating(true);
			try {
				if (opts.mode === "video" && !isFree) {
					const currentCredits = credits;
					const multiplier = opts.quality === "pro" ? 20 : 15;
					const cost = (opts.duration ?? 5) * multiplier;
					// `available` = monthly (Pro) + referral-bonus credits combined.
					if (!currentCredits || currentCredits.available < cost) {
						toast.error(
							`Not enough credits. You have ${currentCredits?.available ?? 0} remaining, need ${cost}.`,
						);
						setIsGenerating(false);
						return;
					}
				}

				const endpoint =
					opts.mode === "image"
						? "/api/canvas/generate-image"
						: "/api/canvas/generate-video";
				toast.info(
					opts.mode === "image"
						? "Generating image..."
						: `Generating ${opts.duration ?? 5}s video...`,
				);

				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						prompt: opts.prompt,
						model: opts.model,
						aspectRatio: opts.aspectRatio,
						resolution: opts.resolution,
						...(opts.imageUrl && { image: opts.imageUrl }),
						...(opts.mode === "video" && {
							duration: opts.duration,
							quality: opts.quality,
							audio: opts.audio,
						}),
					}),
				});

				const data = (await response.json()) as {
					error?: string;
					async?: boolean;
					jobId?: string;
					mediaUrl?: string;
					pathname?: string;
				};
				if (!response.ok) throw new Error(data.error || "Generation failed");

				// Long-form K-Video renders asynchronously on the worker. The finished
				// clip lands in the gallery automatically when the job completes.
				if (data.async) {
					if (data.jobId) setActiveVideoJobId(data.jobId as Id<"videoJobs">);
					setTab("mine");
					setIsGenerating(false);
					return;
				}

				if (!data.mediaUrl || !data.pathname) {
					throw new Error("Generation completed without a media URL.");
				}

				const newId = await createCreation({
					mediaType: opts.mode,
					mediaUrl: data.mediaUrl,
					pathname: data.pathname,
					prompt: opts.prompt,
					modelId: opts.model,
					aspectRatio: opts.aspectRatio,
					resolution: opts.resolution,
					duration: opts.duration,
					quality: opts.quality,
					audio: opts.audio,
				});

				toast.success(
					`${opts.mode === "image" ? "Image" : "Video"} generated!`,
				);

				// Take user to their creations and open the new one
				setTab("mine");
				if (newId) setExpandedCreationId(newId);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Generation failed",
				);
			} finally {
				setIsGenerating(false);
			}
		},
		[
			isGenerating,
			credits,
			createCreation,
			canGenerateImages,
			canGenerateVideos,
			setTab,
		],
	);

	const handleToggleLike = useCallback(
		async (creationId: Id<"canvasCreations">) => {
			try {
				await toggleLikeMutation({ creationId });
			} catch {
				toast.error("Failed to update like");
			}
		},
		[toggleLikeMutation],
	);

	const handlePublish = useCallback(
		async (creationId: Id<"canvasCreations">) => {
			setPublishingIds((prev) => new Set(prev).add(creationId));
			try {
				const result = await publishMutation({ creationId });
				toast.success(
					result.isPublished ? "Published to community!" : "Unpublished",
				);
			} catch {
				toast.error("Failed to publish");
			} finally {
				setPublishingIds((prev) => {
					const next = new Set(prev);
					next.delete(creationId);
					return next;
				});
			}
		},
		[publishMutation],
	);

	const displayCreations =
		tab === "community" ? publishedCreations : myCreations;

	const paginationStatus = tab === "community" ? publishedStatus : myStatus;

	const handleLoadMore = useCallback(() => {
		if (tab === "community") {
			loadMorePublished(PAGE_SIZE);
		} else {
			loadMoreMy(PAGE_SIZE);
		}
	}, [tab, loadMorePublished, loadMoreMy]);

	return {
		tab,
		setTab,
		isGenerating,
		activeVideoJobId,
		clearActiveVideoJob: () => setActiveVideoJobId(null),
		expandedCreation,
		setExpandedCreation,
		displayCreations,
		credits,
		myLikes,
		publishingIds,
		handleGenerate,
		handleToggleLike,
		handlePublish,
		isPro,
		canGenerateImages,
		canGenerateVideos,
		paginationStatus,
		handleLoadMore,
	};
}
