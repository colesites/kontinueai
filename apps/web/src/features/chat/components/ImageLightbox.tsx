"use client";

import { Download, X } from "lucide-react";
import Image from "next/image";
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

// Full-screen view of one image with a download button. Shared by generated
// images and images that arrive inside message markdown (imports), so both
// expand the same way. Rendered through a portal: the trigger can sit inside a
// <p>, and a <div> there is invalid HTML and a hydration error.
export function ImageLightbox({
	src,
	alt,
	downloadName,
	onClose,
}: {
	src: string;
	alt: string;
	downloadName: string;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	if (typeof document === "undefined") return null;

	return createPortal(
		<div
			className="fixed inset-0 z-80 flex items-center justify-center bg-black/85 p-4"
			role="dialog"
			aria-modal="true"
			aria-label={`Expanded image: ${alt || "image"}`}
		>
			<button
				type="button"
				aria-label="Close expanded image"
				className="absolute inset-0 cursor-zoom-out"
				onClick={onClose}
			/>
			<button
				type="button"
				onClick={onClose}
				className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-xs text-white transition-colors hover:bg-black/60"
			>
				<X size={12} />
				Close
			</button>
			<div className="relative z-10 max-h-[92vh] max-w-[96vw]">
				<Image
					src={src}
					alt={alt}
					width={1920}
					height={1080}
					unoptimized
					referrerPolicy="no-referrer"
					className="max-h-[92vh] max-w-[96vw] rounded-lg border border-white/20 object-contain shadow-2xl"
				/>
				<button
					type="button"
					onClick={() => void downloadImage(src, downloadName)}
					className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/45 px-2 py-1 text-xs text-white transition-colors hover:bg-black/60"
				>
					<Download size={12} />
					Download
				</button>
			</div>
		</div>,
		document.body,
	);
}
