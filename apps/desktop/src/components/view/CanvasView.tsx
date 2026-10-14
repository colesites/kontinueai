import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Sparkles,
  Play,
  Heart,
  Share2,
  Expand,
  X,
  Download,
  Loader2,
  Cpu,
  Clock,
  Ratio,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api, type CanvasCreation } from "@/lib/convex-api";
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  K_IMAGE_MODEL_ID,
  K_VIDEO_MODEL_ID,
} from "@repo/ai/lib/canvas-models";
import { ChatInput, type StagedAttachment } from "@/components/chat/ChatInput";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

export default function CanvasView() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Tab: "community" | "mine"
  const [tab, setTab] = useState<"community" | "mine">("community");

  // Mode: "image" | "video"
  const [mode, setMode] = useState<"image" | "video">("image");
  const [aspectRatio, setAspectRatio] = useState("3:2");
  const [imageModel, setImageModel] = useState(K_IMAGE_MODEL_ID);
  const [videoModel, setVideoModel] = useState(K_VIDEO_MODEL_ID);
  const [duration, setDuration] = useState(5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Lightbox & Generation states
  const [expandedCreation, setExpandedCreation] = useState<CanvasCreation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());

  const activeModel = mode === "image" ? imageModel : videoModel;

  // Map canvas models to AnyModelOption format expected by ModelPickerPopover
  const canvasModels = useMemo(() => {
    const list = mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
    return list.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      description: m.description,
      tier: "pro" as const,
    }));
  }, [mode]);

  // Convex queries
  const {
    results: publishedResults,
    status: publishedStatus,
    loadMore: loadMorePublished,
  } = usePaginatedQuery(
    api.canvas.listPublished,
    { sortBy: "likes" },
    { initialNumItems: PAGE_SIZE }
  );

  const {
    results: myResults,
    status: myStatus,
    loadMore: loadMoreMy,
  } = usePaginatedQuery(
    api.canvas.listMyCreations,
    {},
    { initialNumItems: PAGE_SIZE }
  );

  const publishedCreations = publishedResults as CanvasCreation[] | undefined;
  const myCreations = myResults as CanvasCreation[] | undefined;
  const displayCreations = tab === "community" ? publishedCreations : myCreations;
  const paginationStatus = tab === "community" ? publishedStatus : myStatus;

  const credits = useQuery(api.canvas.getCredits);
  const myLikesRaw = useQuery(api.canvas.getMyLikes);

  const myLikes = useMemo(() => {
    return new Set(Array.isArray(myLikesRaw) ? myLikesRaw : []);
  }, [myLikesRaw]);

  // Convex mutations
  const toggleLikeMutation = useMutation(api.canvas.toggleLike);
  const publishMutation = useMutation(api.canvas.publishCreation);
  const createCreationMutation = useMutation(api.canvas.createCreation);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const handleToggleLike = async (creationId: string) => {
    try {
      await toggleLikeMutation({ creationId });
    } catch {
      showToast("Failed to update like");
    }
  };

  const handlePublish = async (creationId: string) => {
    setPublishingIds((prev) => new Set(prev).add(creationId));
    try {
      const res = await publishMutation({ creationId });
      showToast(res.isPublished ? "Published to community!" : "Unpublished");
    } catch {
      showToast("Failed to update publish status");
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(creationId);
        return next;
      });
    }
  };

  const handleGenerate = async (promptText: string, attachments?: StagedAttachment[]) => {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt || isGenerating) return;

    setIsGenerating(true);
    showToast(mode === "image" ? "Generating image..." : `Generating ${duration}s video...`);

    // Check for attached reference image
    const refImage = attachments?.find(
      (a) => (a.mediaType && a.mediaType.startsWith("image/")) || (typeof a.url === "string" && a.url.startsWith("data:image"))
    )?.url;

    try {
      const webAppUrl =
        import.meta.env.VITE_WEB_APP_URL || "https://chat.kontinueai.com";
      const endpoint = `${webAppUrl}/api/canvas/${
        mode === "image" ? "generate-image" : "generate-video"
      }`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          model: activeModel,
          aspectRatio,
          resolution: "1280x720",
          ...(refImage && { image: refImage }),
          ...(mode === "video" && { duration, quality: "standard" }),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation request failed");

      if (data.mediaUrl && data.pathname) {
        await createCreationMutation({
          mediaType: mode,
          mediaUrl: data.mediaUrl,
          pathname: data.pathname,
          prompt: cleanPrompt,
          modelId: activeModel,
          aspectRatio,
          duration: mode === "video" ? duration : undefined,
          resolution: "1280x720",
          referenceImageUrl: refImage || undefined,
        });

        showToast(`${mode === "image" ? "Image" : "Video"} created successfully!`);
        setTab("mine");
      } else {
        showToast("Generation queued. It will appear in My Creations shortly.");
        setTab("mine");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to generate creation");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-transparent dark:bg-background text-foreground overflow-hidden select-none">
      {/* Floating collapsed sidebar button */}
      {isCollapsed && <FloatingSidebarButtonGroup />}

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-black/85 dark:bg-white/95 text-white dark:text-zinc-950 px-4 py-2 text-xs font-semibold shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 border border-white/10 dark:border-zinc-200">
          {toastMessage}
        </div>
      )}

      {/* 1. Top Bar: [ Community | My Creations ] Navigation Switcher (Window-centered) */}
      <div className="pointer-events-none fixed top-2.5 inset-x-0 z-30 flex items-center justify-center px-4">
        <div className="pointer-events-auto flex items-center rounded-full bg-white/60 dark:bg-zinc-900/60 p-1 border border-white/70 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setTab("community")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              tab === "community"
                ? "bg-white dark:bg-purple-600/30 text-purple-900 dark:text-purple-100 border border-purple-300/40 dark:border-purple-500/30 shadow-[0_2px_8px_rgba(168,85,247,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)]"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-transparent"
            )}
          >
            <span>Community</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              tab === "mine"
                ? "bg-white dark:bg-purple-600/30 text-purple-900 dark:text-purple-100 border border-purple-300/40 dark:border-purple-500/30 shadow-[0_2px_8px_rgba(168,85,247,0.12),inset_0_1px_1px_rgba(255,255,255,0.95)]"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-transparent"
            )}
          >
            <span>My Creations</span>
          </button>
        </div>
      </div>
      <div className="h-14 w-full shrink-0" />

      {/* 2. Main Gallery Scrollable Area */}
      <div className="relative flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-48">
        {!displayCreations || paginationStatus === "LoadingFirstPage" ? (
          /* Proper Skeleton Grid: realistic aspect ratios, shimmer gradients, and avatar placeholders */
          <CanvasSkeletonGrid />
        ) : displayCreations.length === 0 ? (
          /* Empty State: Sparkle Icon + Kontinue message */
          <div className="flex min-h-[380px] flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 dark:bg-purple-500/20 ring-1 ring-purple-500/20 shadow-[0_4px_24px_rgba(168,85,247,0.2)]">
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-purple-500/25 blur-xl" />
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {tab === "mine" ? "Your canvas is a blank page" : "Nothing here yet"}
            </h3>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {tab === "mine"
                ? "Describe an image or video below and your creations will appear here."
                : "Be the first to publish — community creations will show up here soon."}
            </p>
          </div>
        ) : (
          /* Creations Masonry Grid */
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {displayCreations.map((creation) => (
              <CreationCardItem
                key={creation._id}
                creation={creation}
                tab={tab}
                isLiked={myLikes.has(creation._id)}
                isPublishing={publishingIds.has(creation._id)}
                onToggleLike={() => handleToggleLike(creation._id)}
                onPublish={() => handlePublish(creation._id)}
                onExpand={() => setExpandedCreation(creation)}
                onShare={() => {
                  const url = `${window.location.origin}/canvas?id=${creation._id}`;
                  navigator.clipboard.writeText(url);
                  showToast("Creation link copied to clipboard!");
                }}
              />
            ))}
          </div>
        )}

        {/* Load More Pagination */}
        {paginationStatus === "CanLoadMore" && (
          <div className="flex justify-center py-6">
            <button
              type="button"
              onClick={() => {
                if (tab === "community") loadMorePublished(PAGE_SIZE);
                else loadMoreMy(PAGE_SIZE);
              }}
              className="rounded-full bg-white/70 dark:bg-zinc-900/60 border border-white/80 dark:border-white/10 px-6 py-2 text-xs font-semibold text-foreground/80 hover:text-foreground shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              Load more
            </button>
          </div>
        )}
        {paginationStatus === "LoadingMore" && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
          </div>
        )}
      </div>

      {/* 3. Creation Lightbox Modal */}
      {expandedCreation && (
        <CreationLightboxModal
          creation={expandedCreation}
          isLiked={myLikes.has(expandedCreation._id)}
          onClose={() => setExpandedCreation(null)}
          onToggleLike={() => handleToggleLike(expandedCreation._id)}
          onShare={() => {
            const url = `${window.location.origin}/canvas?id=${expandedCreation._id}`;
            navigator.clipboard.writeText(url);
            showToast("Creation link copied to clipboard!");
          }}
        />
      )}

      {/* 4. Bottom Floating Liquid Glass Creation Composer (Reusing desktop ChatInput) */}
      <div className="pointer-events-none absolute bottom-4 inset-x-0 z-40 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-3xl">
          <ChatInput
            placeholder="What do you want to create?"
            loading={isGenerating}
            models={canvasModels as any}
            modelId={activeModel}
            onModelChange={(id) => {
              if (mode === "image") setImageModel(id);
              else setVideoModel(id);
            }}
            hideAgentMode
            canvasControls={{
              mode,
              onModeChange: setMode,
              aspectRatio,
              onAspectRatioChange: setAspectRatio,
              duration,
              onDurationChange: setDuration,
              credits: credits?.available,
            }}
            onSend={(text, _m, atts) => void handleGenerate(text, atts)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Realistic Masonry Skeleton Grid Component ──────────────
function CanvasSkeletonGrid() {
  const skeletonAspects = [
    "aspect-[3/4]",
    "aspect-[16/9]",
    "aspect-[1/1]",
    "aspect-[3/2]",
    "aspect-[9/16]",
    "aspect-[4/3]",
    "aspect-[3/4]",
    "aspect-[16/9]",
  ];

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
      {skeletonAspects.map((aspect, idx) => (
        <div
          key={idx}
          className={cn(
            "group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-white/60 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.02)] animate-pulse",
            aspect
          )}
        >
          {/* Subtle Shimmer Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 via-transparent to-white/10 dark:to-white/5" />

          {/* Bottom Skeleton Placeholders */}
          <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-full bg-black/10 dark:bg-white/10" />
              <div className="h-3 w-16 rounded-full bg-black/10 dark:bg-white/10" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-6 rounded-full bg-black/10 dark:bg-white/10" />
              <div className="size-6 rounded-full bg-black/10 dark:bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CreationCardItem Component ─────────────────────────────
function CreationCardItem({
  creation,
  tab,
  isLiked,
  isPublishing,
  onToggleLike,
  onPublish,
  onExpand,
  onShare,
}: {
  creation: CanvasCreation;
  tab: "community" | "mine";
  isLiked: boolean;
  isPublishing: boolean;
  onToggleLike: () => void;
  onPublish: () => void;
  onExpand: () => void;
  onShare: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc = useMemo(() => {
    if (!creation.mediaUrl) return "";
    return creation.mediaUrl.includes("#")
      ? creation.mediaUrl
      : `${creation.mediaUrl}#t=0.001`;
  }, [creation.mediaUrl]);

  useEffect(() => {
    if (creation.mediaType === "video" && videoRef.current) {
      const vid = videoRef.current;
      if (vid.readyState >= 2 && vid.paused) {
        const p = vid.play();
        if (p !== undefined) {
          p.then(() => {
            vid.pause();
            vid.currentTime = 0.001;
          }).catch(() => undefined);
        }
      }
    }
  }, [creation.mediaType, videoSrc]);

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
    <div
      onClick={onExpand}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-white/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(168,85,247,0.14)] cursor-pointer"
    >
      {/* Media: Image or Video */}
      <div className="relative w-full">
        {creation.mediaType === "image" ? (
          <img
            src={creation.mediaUrl}
            alt={creation.prompt}
            className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              loop
              playsInline
              preload="auto"
              className="h-auto w-full object-cover block"
              onLoadedMetadata={(e) => {
                const vid = e.currentTarget;
                try {
                  vid.currentTime = 0.001;
                } catch {
                  // ignore
                }
              }}
              onLoadedData={(e) => {
                const vid = e.currentTarget;
                if (vid.paused) {
                  const playPromise = vid.play();
                  if (playPromise !== undefined) {
                    playPromise
                      .then(() => {
                        vid.pause();
                        vid.currentTime = 0.001;
                      })
                      .catch(() => undefined);
                  }
                }
              }}
            />
            {/* Play indicator */}
            <div className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur-sm shadow-lg">
                <Play className="h-4 w-4 fill-current ml-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* Global Dark Gradient Overlay on Hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Top-left Publish badge (Only in 'mine' tab) */}
        {tab === "mine" && (
          <div className="absolute top-3 left-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              disabled={isPublishing}
              onClick={(e) => {
                e.stopPropagation();
                onPublish();
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg border backdrop-blur-md transition-all cursor-pointer",
                creation.isPublished
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-black/50 text-white/90 border-white/20 hover:bg-black/70"
              )}
            >
              {isPublishing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : creation.isPublished ? (
                "Published"
              ) : (
                "Publish"
              )}
            </button>
          </div>
        )}

        {/* Bottom Overlay Info & Action buttons */}
        <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between pointer-events-none">
          {/* Bottom Left: Owner Name */}
          <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10.5px] font-medium text-white/95 ring-1 ring-white/15 backdrop-blur-md">
              {creation.ownerName || "Anonymous"}
            </span>
          </div>

          {/* Bottom Right: Action buttons */}
          <div className="relative z-20 flex items-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-auto">
            <button
              type="button"
              title="Share creation"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/60 shadow-md cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Expand preview"
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/60 shadow-md cursor-pointer"
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Like creation"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLike();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/60 shadow-md cursor-pointer"
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5",
                  isLiked ? "fill-rose-500 text-rose-500" : "text-white"
                )}
              />
            </button>
            {creation.likeCount > 0 && (
              <span className="text-[10.5px] font-semibold text-white drop-shadow-md">
                {creation.likeCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CreationLightboxModal Component ────────────────────────
function CreationLightboxModal({
  creation,
  isLiked,
  onClose,
  onToggleLike,
  onShare,
}: {
  creation: CanvasCreation;
  isLiked: boolean;
  onClose: () => void;
  onToggleLike: () => void;
  onShare: () => void;
}) {
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const handleDownload = async () => {
    try {
      const response = await fetch(creation.mediaUrl);
      const blob = await response.blob();
      const ext = creation.mediaType === "video" ? "mp4" : "png";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `canvas_${creation._id}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(creation.mediaUrl, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 mx-auto flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-card ring-1 ring-foreground/10 shadow-2xl lg:flex-row"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/75 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media Preview on Left */}
        <div className="relative flex max-h-[60vh] flex-1 items-center justify-center overflow-hidden bg-black lg:max-h-none">
          {!mediaLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
          )}

          {creation.mediaType === "image" ? (
            <img
              src={creation.mediaUrl}
              alt={creation.prompt}
              className={cn(
                "max-h-[85vh] w-auto object-contain transition-opacity duration-300",
                mediaLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setMediaLoaded(true)}
            />
          ) : (
            <video
              src={creation.mediaUrl}
              controls
              autoPlay
              loop
              playsInline
              className={cn(
                "max-h-[85vh] w-auto transition-opacity duration-300",
                mediaLoaded ? "opacity-100" : "opacity-0"
              )}
              onCanPlay={() => setMediaLoaded(true)}
            />
          )}
        </div>

        {/* Details Sidebar on Right */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto p-6 lg:w-80 bg-background/95 backdrop-blur-xl">
          {/* Creator Profile */}
          <div className="flex items-center gap-3">
            {creation.ownerImageUrl ? (
              <img
                src={creation.ownerImageUrl}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600/20 text-purple-700 dark:text-purple-300 font-bold text-xs">
                {(creation.ownerName || "A")[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground">
                {creation.ownerName || "Anonymous"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(creation.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Prompt
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90 font-medium select-text">
              {creation.prompt}
            </p>
          </div>

          {/* Metadata Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-1 text-[10.5px] font-medium text-purple-700 dark:text-purple-300">
              <Cpu className="h-3 w-3" />
              <span>{creation.modelId.split("/").pop()}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
              <Ratio className="h-3 w-3" />
              <span>{creation.aspectRatio}</span>
            </span>
            {creation.duration && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{creation.duration}s</span>
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-auto flex items-center gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onToggleLike}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all cursor-pointer",
                isLiked
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                  : "border-border bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-rose-500")} />
              <span>{creation.likeCount}</span>
            </button>
            <button
              type="button"
              onClick={onShare}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-black/5 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-black/5 dark:bg-white/5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
