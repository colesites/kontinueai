"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import type { MessageAttachment } from "../lib/message-transformer";
import { ImageLightbox } from "./ImageLightbox";

// Files the USER attached to their own message: compact thumbnails that open a
// preview. No download or "generated" labels, since these are the user's files.
export function MessageAttachments({
	attachments,
}: {
	attachments: MessageAttachment[];
}) {
	const [preview, setPreview] = useState<MessageAttachment | null>(null);
	if (attachments.length === 0) return null;

	return (
		<>
			<div className="not-prose mb-2 flex flex-wrap justify-end gap-1.5">
				{attachments.map((file) =>
					file.mediaType.startsWith("image/") ? (
						<button
							key={file.url}
							type="button"
							onClick={() => setPreview(file)}
							title={file.filename}
							aria-label={`Preview ${file.filename}`}
							className="size-20 cursor-zoom-in overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
						>
							{/* biome-ignore lint/performance/noImgElement: data: URLs from the composer */}
							<img
								src={file.url}
								alt={file.filename}
								className="size-full object-cover"
							/>
						</button>
					) : (
						<span
							key={file.url}
							title={file.filename}
							className="inline-flex max-w-[200px] items-center gap-1.5 rounded-xl bg-foreground/5 px-2.5 py-2 text-xs text-foreground/80 ring-1 ring-foreground/10"
						>
							<FileText size={14} className="shrink-0 text-muted-foreground" />
							<span className="truncate">{file.filename}</span>
						</span>
					),
				)}
			</div>

			{preview && (
				<ImageLightbox
					src={preview.url}
					alt={preview.filename}
					downloadName={preview.filename}
					allowDownload={false}
					onClose={() => setPreview(null)}
				/>
			)}
		</>
	);
}
