// What a user attached to a message, drawn as its own row above the bubble:
// image thumbnails (click to view full size) and a chip per other file.

import { Paperclip } from "lucide-react";
import { ImageBlock } from "@/components/ai-elements/rich-blocks";
import type { MessageImage } from "@/lib/kode-attachments";

export function UserAttachments({ images, files }: { images: MessageImage[]; files: string[] }) {
  if (images.length === 0 && files.length === 0) return null;
  return (
    <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">
      {images.map((image) => (
        <ImageBlock key={image.path} image={image} compact />
      ))}
      {files.map((name) => (
        <span
          key={name}
          title={name}
          className="kontinue-3d flex h-8 max-w-[240px] items-center gap-1.5 rounded-full px-3 text-label text-foreground/85"
        >
          <Paperclip size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}
