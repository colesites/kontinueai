import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { ImageIcon, X } from "lucide-react";

export function AttachmentPreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const fileExt = file.name.split(".").pop()?.toUpperCase() ?? "";
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif)$/i.test(file.name);
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isText =
    file.type.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/x-yaml",
      "text/xml",
    ].includes(file.type) ||
    /\.(txt|md|markdown|csv|json|xml|yml|yaml|log|ini|conf|env|toml)$/i.test(
      file.name,
    );
  const [imageError, setImageError] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const objectUrl = useMemo(() => {
    if (!isImage && !isVideo && !isAudio && !isPdf) return null;
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }, [file, isImage, isVideo, isAudio, isPdf]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!isText) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setTextPreview(text.slice(0, 800));
    };
    reader.onerror = () => setTextPreview(null);
    reader.readAsText(file.slice(0, 2000));
  }, [file, isText]);

  return (
    <div className="group relative flex min-w-[240px] max-w-[360px] items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-2.5 pr-9 shadow-sm">
      {isImage && objectUrl && !imageError ? (
        <Image
          src={objectUrl}
          alt={file.name}
          width={64}
          height={64}
          className="h-16 w-16 rounded-lg border border-border/60 object-cover"
          onError={() => setImageError(true)}
        />
      ) : isVideo && objectUrl && !imageError ? (
        <video
          src={objectUrl}
          className="h-16 w-16 rounded-lg border border-border/60 object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setImageError(true)}
        />
      ) : isPdf && objectUrl && !imageError ? (
        <embed
          src={objectUrl}
          type="application/pdf"
          className="h-20 w-16 rounded-lg border border-border/60 bg-background/80"
          onError={() => setImageError(true)}
        />
      ) : isText ? (
        <div className="flex h-20 w-16 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground/80">
            TEXT
          </span>
        </div>
      ) : isAudio && objectUrl && !imageError ? (
        <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
            AUDIO
          </span>
        </div>
      ) : (
        <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
          <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
            {fileExt || "FILE"}
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {file.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {(file.size / 1024).toFixed(1)}KB
        </div>
        {isText && textPreview && (
          <div className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] leading-snug text-muted-foreground">
            {textPreview}
          </div>
        )}
        {isAudio && objectUrl && !imageError && (
          <audio
            src={objectUrl}
            controls
            preload="metadata"
            className="mt-2 h-8 w-full"
            onError={() => setImageError(true)}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="Remove file"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
