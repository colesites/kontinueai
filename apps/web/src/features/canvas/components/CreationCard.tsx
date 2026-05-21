"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Heart, Expand, Play, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@repo/convex/convex/_generated/dataModel";

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
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (creation.mediaType === "video" && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (creation.mediaType === "video" && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className="group relative cursor-pointer overflow-hidden border border-border/40 bg-card/80 transition-all duration-300 break-inside-avoid rounded-2xl"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onExpand(creation)}
    >
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
            {!isHovered && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/40 text-foreground backdrop-blur-sm border border-border/20">
                  <Play className="h-5 w-5 fill-current" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Shading Overlay (Visible on hover) */}
        <div
          className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
            isHovered ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Info Overlays */}
        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between pointer-events-none">
          {/* Bottom Left: Owner Name */}
          <div
            className={`transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0"}`}
          >
            <span className="text-[11px] font-bold tracking-tight text-foreground drop-shadow-lg uppercase bg-background/60 px-2 py-0.5 rounded-sm border border-border/20 backdrop-blur-md">
              {creation.ownerName || "anonymous"}
            </span>
          </div>

          {/* Bottom Right: Actions */}
          <div
            className={`flex items-center gap-2 transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0"}`}
          >
            <button
              type="button"
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur-md hover:bg-background/80 transition-colors border border-border/20 shadow-2xl"
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
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur-md hover:bg-background/80 transition-colors border border-border/20 shadow-2xl"
              onClick={(e) => {
                e.stopPropagation();
                onExpand(creation);
              }}
            >
              <Expand className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-background/60 text-foreground backdrop-blur-md hover:bg-background/80 transition-colors border border-border/20 shadow-2xl"
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
              <span className="text-[11px] font-black text-foreground drop-shadow-2xl">
                {creation.likeCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
