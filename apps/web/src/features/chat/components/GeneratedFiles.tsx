"use client";

import { Download, FileText } from "lucide-react";
import type { GeneratedFile } from "../lib/message-transformer";

function formatBytes(bytes: number): string {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Download cards for files the run_code sandbox produced. The model never
 * pastes these URLs into its answer — they are rendered from the tool result so
 * the file is a real, clickable artifact rather than a link in prose.
 */
export function GeneratedFiles({ files }: { files: GeneratedFile[] }) {
	if (files.length === 0) return null;

	return (
		<div className="mt-3 flex flex-col gap-2">
			{files.map((file) => (
				<a
					key={file.url}
					href={file.url}
					download={file.name}
					target="_blank"
					rel="noopener noreferrer"
					className="group flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2.5 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06]"
				>
					<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.04]">
						<FileText className="h-4 w-4 text-muted-foreground" />
					</span>
					<span className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-medium text-foreground">
							{file.name}
						</span>
						{file.bytes > 0 && (
							<span className="text-xs text-muted-foreground">
								{formatBytes(file.bytes)}
							</span>
						)}
					</span>
					<Download className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
				</a>
			))}
		</div>
	);
}
