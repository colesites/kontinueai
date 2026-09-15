import { FileText, Music, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** Formats a byte count as a short human-readable size (B, KB, MB). */
function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compact preview tile for a pending chat attachment: a thumbnail for images
 * and videos, or a small name/type card for other files, with a remove button.
 */
export function AttachmentPreview({
	file,
	onRemove,
}: {
	file: File;
	onRemove: () => void;
}) {
	const fileExt = file.name.includes(".")
		? (file.name.split(".").pop()?.toUpperCase() ?? "")
		: "";
	const isImage =
		file.type.startsWith("image/") ||
		/\.(png|jpe?g|webp|gif|bmp|svg|heic|heif)$/i.test(file.name);
	const isVideo = file.type.startsWith("video/");
	const isAudio = file.type.startsWith("audio/");
	const [mediaError, setMediaError] = useState(false);
	const objectUrl = useMemo(() => {
		if (!isImage && !isVideo) return null;
		try {
			return URL.createObjectURL(file);
		} catch {
			return null;
		}
	}, [file, isImage, isVideo]);

	useEffect(() => {
		return () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [objectUrl]);

	const removeButton = (
		<button
			type="button"
			onClick={onRemove}
			className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-border transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-destructive hover:text-destructive-foreground"
			title="Remove file"
			aria-label={`Remove ${file.name}`}
		>
			<X className="h-3.5 w-3.5" />
		</button>
	);

	// Media: thumbnail only, like Claude. The name lives in the tooltip.
	if ((isImage || isVideo) && objectUrl && !mediaError) {
		return (
			<div
				className="relative h-16 w-16 shrink-0"
				title={`${file.name} · ${formatBytes(file.size)}`}
			>
				<div className="relative h-full w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
					{isImage ? (
						// biome-ignore lint/performance/noImgElement: blob URLs can't go through next/image optimization.
						<img
							src={objectUrl}
							alt={file.name}
							className="h-full w-full object-cover"
							onError={() => setMediaError(true)}
						/>
					) : (
						<>
							{/* Play badge sits underneath so codecs that never paint a frame (e.g. HEVC .mov) don't leave a blank tile. */}
							<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
								<Play className="h-5 w-5" />
							</div>
							{/* #t=0.1 makes mobile Safari/Chrome paint the first frame with preload="metadata". */}
							<video
								src={`${objectUrl}#t=0.1`}
								className="relative h-full w-full object-cover"
								muted
								playsInline
								preload="metadata"
								onError={() => setMediaError(true)}
							/>
						</>
					)}
				</div>
				{removeButton}
			</div>
		);
	}

	// Documents: compact card with a truncated name and type.
	const Icon = isAudio ? Music : FileText;
	return (
		<div
			className="surface-card relative flex h-16 w-44 shrink-0 items-center gap-2 rounded-xl p-2 pr-3"
			title={file.name}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground">
				<Icon className="h-4 w-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium text-foreground">
					{file.name}
				</div>
				<div className="truncate text-[11px] text-muted-foreground">
					{fileExt ? `${fileExt} · ` : ""}
					{formatBytes(file.size)}
				</div>
			</div>
			{removeButton}
		</div>
	);
}
