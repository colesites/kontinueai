"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";

interface ChatMessageImagesProps {
  imageParts: string[];
}

export function ChatMessageImages({ imageParts }: ChatMessageImagesProps) {
  const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (expandedImageIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedImageIndex(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImageIndex]);

  const handleDownloadImage = async (src: string, index: number) => {
    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch image (${response.status})`);
      }

      const blob = await response.blob();
      const extension =
        blob.type === "image/png"
          ? "png"
          : blob.type === "image/jpeg"
            ? "jpg"
            : "webp";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `generated-${index + 1}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("[chat-message] failed to download image", error);
    }
  };

  if (!imageParts || imageParts.length === 0) return null;

  const expandedSrc =
    expandedImageIndex !== null ? imageParts[expandedImageIndex] : undefined;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {imageParts.map((src, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setExpandedImageIndex(i)}
              className="cursor-zoom-in overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary/50"
              title="Expand image"
            >
              <Image
                src={src}
                alt={`Generated ${i + 1}`}
                width={800}
                height={800}
                className="max-h-80 rounded-lg object-contain"
              />
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadImage(src, i)}
              className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Download size={12} />
              Download
            </button>
          </div>
        ))}
      </div>

      {expandedImageIndex !== null && expandedSrc && (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setExpandedImageIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded generated image"
        >
          <button
            type="button"
            onClick={() => setExpandedImageIndex(null)}
            className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white transition-colors hover:bg-black/60"
          >
            <X size={12} />
            Close
          </button>
          <div
            className="relative max-h-[92vh] max-w-[96vw]"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={expandedSrc}
              alt={`Expanded generated ${expandedImageIndex + 1}`}
              width={1920}
              height={1080}
              className="max-h-[92vh] max-w-[96vw] rounded-lg border border-white/20 object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() =>
                void handleDownloadImage(expandedSrc, expandedImageIndex)
              }
              className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/45 px-2 py-1 text-xs text-white transition-colors hover:bg-black/60"
            >
              <Download size={12} />
              Download
            </button>
          </div>
        </div>
      )}
    </>
  );
}
