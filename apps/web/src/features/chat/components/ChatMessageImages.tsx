"use client";

import { Download } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { downloadImage, ImageLightbox } from "./ImageLightbox";

interface ChatMessageImagesProps {
	imageParts: string[];
}

export function ChatMessageImages({ imageParts }: ChatMessageImagesProps) {
	const [expandedImageIndex, setExpandedImageIndex] = useState<number | null>(
		null,
	);

	if (!imageParts || imageParts.length === 0) return null;

	const expandedSrc =
		expandedImageIndex !== null ? imageParts[expandedImageIndex] : undefined;

	return (
		<>
			<div className="mt-3 flex flex-wrap gap-2">
				{imageParts.map((src, i) => (
					<div key={src} className="flex flex-col gap-1.5">
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
							onClick={() => void downloadImage(src, `generated-${i + 1}`)}
							className="inline-flex w-fit items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
						>
							<Download size={12} />
							Download
						</button>
					</div>
				))}
			</div>

			{expandedImageIndex !== null && expandedSrc && (
				<ImageLightbox
					src={expandedSrc}
					alt={`Expanded generated ${expandedImageIndex + 1}`}
					downloadName={`generated-${expandedImageIndex + 1}`}
					onClose={() => setExpandedImageIndex(null)}
				/>
			)}
		</>
	);
}
