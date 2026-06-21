"use client";

import { useCanvas } from "../hooks/use-canvas";
import { CanvasGallery } from "./CanvasGallery";
import { CanvasInputBar } from "./CanvasInputBar";
import { CreationLightbox } from "./CreationLightbox";
import { KVideoJobProgress } from "./KVideoJobProgress";
export function CanvasClient() {
	const {
		tab,
		isGenerating,
		activeVideoJobId,
		clearActiveVideoJob,
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
	} = useCanvas();

	return (
		<div className="relative min-h-screen bg-background text-foreground pb-32">
			<main className="w-full">
				<CanvasGallery
					items={displayCreations}
					tab={tab}
					myLikes={myLikes}
					publishingIds={publishingIds}
					onToggleLike={handleToggleLike}
					onExpand={setExpandedCreation}
					onPublish={handlePublish}
					paginationStatus={paginationStatus}
					onLoadMore={handleLoadMore}
				/>
			</main>

			{expandedCreation && (
				<CreationLightbox
					creation={expandedCreation}
					isLiked={myLikes.has(expandedCreation._id)}
					onClose={() => setExpandedCreation(null)}
					onToggleLike={handleToggleLike}
				/>
			)}

			<CanvasInputBar
				onGenerate={handleGenerate}
				isGenerating={isGenerating}
				credits={{
					// Combined spendable credits and matching denominator: monthly
					// allowance (Pro only) plus the persistent referral-bonus pool.
					remaining: credits?.available ?? 0,
					total:
						(credits?.isPro ? (credits?.monthly?.total ?? 0) : 0) +
						(credits?.bonus?.total ?? 0),
				}}
				canGenerateImages={canGenerateImages}
				canGenerateVideos={canGenerateVideos}
				isPro={isPro}
			/>

			{activeVideoJobId && (
				<KVideoJobProgress
					jobId={activeVideoJobId}
					onClose={clearActiveVideoJob}
				/>
			)}
		</div>
	);
}
