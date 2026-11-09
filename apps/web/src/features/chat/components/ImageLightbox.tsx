"use client";

import { Download, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

// Downloads an image through a blob so cross-origin sources (re-hosted
// imports, generated images) save as a file rather than opening in a tab.
export async function downloadImage(src: string, baseName: string) {
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
					: blob.type === "image/gif"
						? "gif"
						: "webp";
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = /\.[a-z0-9]{2,5}$/i.test(baseName)
			? baseName
			: `${baseName}.${extension}`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	} catch (error) {
		console.error("[chat-message] failed to download image", error);
	}
}

// Full-screen view of one image. Shared by generated images, images inside
// message markdown (imports) and the user's own attachments; `allowDownload`
// is off for attachments, since people already have their own files. Rendered
// through a portal: the trigger can sit inside a <p>, where a <div> is invalid
// HTML and a hydration error.
export function ImageLightbox({
	src,
	alt,
	downloadName,
	onClose,
	allowDownload = true,
}: {
	src: string;
	alt: string;
	downloadName: string;
	onClose: () => void;
	allowDownload?: boolean;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	if (typeof document === "undefined") return null;

	const toolbarButton =
		"inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

	return createPortal(
		<div
			className="fixed inset-0 z-80 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-label={`Expanded image: ${alt || "image"}`}
		>
			{/* Clicking the backdrop closes. */}
			<button
				type="button"
				aria-label="Close expanded image"
				tabIndex={-1}
				className="absolute inset-0 cursor-zoom-out"
				onClick={onClose}
			/>

			<div className="relative z-10 flex max-h-full max-w-full flex-col items-end gap-3">
				<div className="flex items-center gap-2">
					{allowDownload && (
						<button
							type="button"
							onClick={() => void downloadImage(src, downloadName)}
							className={toolbarButton}
						>
							<Download size={13} />
							Download
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						className={toolbarButton}
						// biome-ignore lint/a11y/noAutofocus: focus the dialog's close control so Esc/Enter work at once
						autoFocus
					>
						<X size={13} />
						Close
					</button>
				</div>
				{/* biome-ignore lint/performance/noImgElement: data: and storage URLs; next/image rejects unlisted hosts */}
				<img
					src={src}
					alt={alt}
					referrerPolicy="no-referrer"
					className="max-h-[calc(100vh-7rem)] max-w-[min(96vw,1400px)] rounded-xl border border-white/15 object-contain shadow-2xl"
				/>
			</div>
		</div>,
		document.body,
	);
}
