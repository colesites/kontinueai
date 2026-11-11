// Click an image to see it full size: attachments in the composer, images in
// sent messages, screenshots from imported sessions and images a model shows.

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ImageLightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image"}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt || "Image"}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
      />
      <button
        type="button"
        aria-label="Close"
        title="Close (Esc)"
        onClick={onClose}
        className="absolute top-4 right-4 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={16} />
      </button>
      {alt ? <p className="absolute bottom-4 max-w-[80vw] truncate text-label text-white/70">{alt}</p> : null}
    </div>,
    document.body,
  );
}

/** An image that opens full size on click. */
export function ExpandableImage({ src, alt, className, wrapperClassName, ...props }: ImgHTMLAttributes<HTMLImageElement> & { wrapperClassName?: string }) {
  const [open, setOpen] = useState(false);
  if (typeof src !== "string" || !src) return <img src={src} alt={alt} className={className} {...props} />;
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title="View full size"
        aria-label={`View ${alt || "image"} full size`}
        className={cn("cursor-zoom-in", wrapperClassName)}
      >
        <img src={src} alt={alt} className={className} {...props} />
      </button>
      {open ? <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
