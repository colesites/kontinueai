"use client";

import { AttachmentPreview } from "./AttachmentPreview";

type ChatInputBodyExtrasProps = {
	isListening: boolean;
	activeRecognitionLanguage: string | null;
};

/**
 * Status line rendered under the chat input (currently the speech
 * recognition "Listening..." indicator). Renders nothing when idle.
 */
export function ChatInputBodyExtras({
	isListening,
	activeRecognitionLanguage,
}: ChatInputBodyExtrasProps) {
	if (!isListening) return null;
	return (
		<div className="mt-2 px-1 text-xs text-primary/90">
			Listening...{" "}
			{activeRecognitionLanguage ? `(${activeRecognitionLanguage})` : ""}
		</div>
	);
}

type AttachmentTrayProps = {
	attachedFiles: File[];
	onRemoveFile: (index: number) => void;
};

// Stable React keys per File object. Re-selecting the same file produces a new
// File with identical name/size/lastModified, so metadata-based keys collide
// and preview state leaks between tiles after a removal.
const fileIds = new WeakMap<File, number>();
let nextFileId = 0;

/** Returns a unique, stable id for a File object for use as a React key. */
function getFileId(file: File) {
	let id = fileIds.get(file);
	if (id === undefined) {
		id = nextFileId++;
		fileIds.set(file, id);
	}
	return id;
}

/**
 * Single horizontal, scrollable row of attachments rendered above the input,
 * so any number of files never pushes the text field out of view.
 */
export function AttachmentTray({
	attachedFiles,
	onRemoveFile,
}: AttachmentTrayProps) {
	if (attachedFiles.length === 0) return null;
	const seen = new Map<number, number>();
	return (
		<div className="-mx-1 overflow-x-auto overscroll-x-contain px-3 pb-1 pt-2.5 [scrollbar-width:thin]">
			<div className="flex w-max gap-2.5">
				{attachedFiles.map((file, index) => {
					const id = getFileId(file);
					// The same File object can appear twice (e.g. paste + drop).
					const occurrence = seen.get(id) ?? 0;
					seen.set(id, occurrence + 1);
					return (
						<AttachmentPreview
							key={`${id}-${occurrence}`}
							file={file}
							onRemove={() => onRemoveFile(index)}
						/>
					);
				})}
			</div>
		</div>
	);
}
