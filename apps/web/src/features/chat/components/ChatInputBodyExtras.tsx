"use client";

import { AttachmentPreview } from "./AttachmentPreview";

type ChatInputBodyExtrasProps = {
  isListening: boolean;
  activeRecognitionLanguage: string | null;
  attachedFiles: File[];
  onRemoveFile: (index: number) => void;
};

export function ChatInputBodyExtras({
  isListening,
  activeRecognitionLanguage,
  attachedFiles,
  onRemoveFile,
}: ChatInputBodyExtrasProps) {
  return (
    <>
      {isListening && (
        <div className="mt-2 px-1 text-xs text-primary/90">
          Listening...{" "}
          {activeRecognitionLanguage ? `(${activeRecognitionLanguage})` : ""}
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 px-1">
          {attachedFiles.map((file, index) => (
            <AttachmentPreview
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => onRemoveFile(index)}
            />
          ))}
        </div>
      )}
    </>
  );
}
