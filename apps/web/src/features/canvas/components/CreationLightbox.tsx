"use client";

import { useState } from "react";
import Image from "next/image";
import {
  X,
  Heart,
  Download,
  Clock,
  Ratio,
  Cpu,
  Share2,
  Loader2,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";
import type { CreationData } from "./CreationCard";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { getCanvasModelById } from "@repo/ai/lib/canvas-models";

interface CreationLightboxProps {
  creation: CreationData;
  isLiked: boolean;
  onClose: () => void;
  onToggleLike: (id: Id<"canvasCreations">) => void;
}

export function CreationLightbox({
  creation,
  isLiked,
  onClose,
  onToggleLike,
}: CreationLightboxProps) {
  const model = getCanvasModelById(creation.modelId);
  const [mediaLoaded, setMediaLoaded] = useState(false);

  const handleDownload = async () => {
    const response = await fetch(creation.mediaUrl);
    const blob = await response.blob();
    const ext = creation.mediaType === "video" ? "mp4" : "png";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas_${creation._id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media */}
        <div className="relative flex max-h-[60vh] flex-1 items-center justify-center overflow-hidden bg-black lg:max-h-none">
          {/* Loading skeleton */}
          {!mediaLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Loading {creation.mediaType}...
                </span>
              </div>
            </div>
          )}

          {creation.mediaType === "image" ? (
            <Image
              src={creation.mediaUrl}
              alt={creation.prompt}
              width={1200}
              height={1200}
              unoptimized
              className={`max-h-full w-auto object-contain transition-opacity duration-300 ${
                mediaLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setMediaLoaded(true)}
            />
          ) : (
            <video
              src={creation.mediaUrl}
              controls={mediaLoaded}
              autoPlay
              loop
              muted
              playsInline
              className={`max-h-full w-auto transition-opacity duration-300 ${
                mediaLoaded ? "opacity-100" : "opacity-0"
              }`}
              onCanPlay={() => setMediaLoaded(true)}
            />
          )}
        </div>

        {/* Details sidebar */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto p-6 lg:w-80">
          {/* Creator info */}
          <div className="flex items-center gap-3">
            {creation.ownerImageUrl && (
              <Image
                src={creation.ownerImageUrl}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="rounded-full"
              />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {creation.ownerName || "Anonymous"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(creation.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Prompt
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">
              {creation.prompt}
            </p>
          </div>

          {/* Metadata pills */}
          <div className="flex flex-wrap gap-2">
            {model && (
              <MetaPill icon={<Cpu className="h-3 w-3" />}>
                {model.name}
              </MetaPill>
            )}
            <MetaPill icon={<Ratio className="h-3 w-3" />}>
              {creation.aspectRatio}
            </MetaPill>
            {creation.duration && (
              <MetaPill icon={<Clock className="h-3 w-3" />}>
                {creation.duration}s
              </MetaPill>
            )}
          </div>

          {/* Actions */}
          <div className="mt-auto flex items-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleLike(creation._id)}
              className={`gap-1.5 ${isLiked ? "border-red-500/30 text-red-500" : ""}`}
            >
              <Heart className={`h-4 w-4 ${isLiked ? "fill-red-500" : ""}`} />
              {creation.likeCount}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("id", creation._id);
                navigator.clipboard.writeText(url.toString());
                toast.success("Link copied to clipboard!");
              }}
              className="gap-1.5"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaPill({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}
