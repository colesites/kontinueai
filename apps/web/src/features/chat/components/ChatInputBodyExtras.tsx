"use client";

import { AttachmentPreview } from "./AttachmentPreview";

type ChatInputBodyExtrasProps = {
	isListening: boolean;
	activeRecognitionLanguage: string | null;
};

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

/**
 * Single horizontal, scrollable row of attachments rendered above the input,
 * so any number of files never pushes the text field out of view.
 */
export function AttachmentTray({
	attachedFiles,
	onRemoveFile,
}: AttachmentTrayProps) {
	if (attachedFiles.length === 0) return null;
	return (
		<div className="-mx-1 overflow-x-auto overscroll-x-contain px-3 pb-1 pt-2 [scrollbar-width:thin]">
			<div className="flex w-max gap-2">
				{attachedFiles.map((file, index) => (
					<AttachmentPreview
						key={`${file.name}-${file.size}-${file.lastModified}-${file.type}`}
						file={file}
						onRemove={() => onRemoveFile(index)}
					/>
				))}
			</div>
		</div>
	);
}
