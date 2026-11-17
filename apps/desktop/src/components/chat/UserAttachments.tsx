// What a user attached to a message, drawn as its own row above the bubble:
// image thumbnails (click to view full size) and a small card per other file.

import { FileText } from "lucide-react";
import { ImageBlock } from "@/components/ai-elements/rich-blocks";
import type { MessageImage } from "@/lib/kode-attachments";

export function UserAttachments({ images, files }: { images: MessageImage[]; files: string[] }) {
  if (images.length === 0 && files.length === 0) return null;
  return (
    <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">
      {images.map((image) => (
        <ImageBlock key={image.path} image={image} compact />
      ))}
      {files.map((name) => {
        const ext = name.includes(".") ? name.split(".").pop()!.slice(0, 4) : "";
        return (
          <span
            key={name}
            title={name}
            className="flex h-10 max-w-[240px] items-center gap-2 rounded-xl border border-black/[0.07] bg-black/[0.02] pr-3 pl-1.5 text-label text-foreground/85 dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-micro font-medium uppercase text-muted-foreground dark:bg-white/[0.06]">
              {ext || <FileText size={13} />}
            </span>
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
}
