import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { ImageIcon } from "lucide-react";
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  IMAGE_ASPECT_VALUES,
  IMAGE_SIZE_VALUES,
  getSupportedImageOptions,
} from "../lib/image-options";

type ChatInputImageOptionsProps = {
  model: string;
  imageAspectRatio: string;
  imageSize: string | null;
  onImageAspectRatioChange: (value: string) => void;
  onImageSizeChange: (value: string | null) => void;
};

export function ChatInputImageOptions({
  model,
  imageAspectRatio,
  imageSize,
  onImageAspectRatioChange,
  onImageSizeChange,
}: ChatInputImageOptionsProps) {
  const supportedImageOptions = getSupportedImageOptions(model);
  const supportedAspectRatios = supportedImageOptions.aspectRatios;
  const supportedSizes = supportedImageOptions.sizes;

  return (
    <div className="flex items-center gap-1 border-l border-border/60 pl-1">
      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Select
        value={imageSize ?? (imageAspectRatio || "auto")}
        onValueChange={(v) => {
          if (v === "default" || v === "") {
            onImageSizeChange(null);
            onImageAspectRatioChange("auto");
          } else if (IMAGE_SIZE_VALUES.has(v)) {
            onImageSizeChange(v);
            onImageAspectRatioChange("auto");
          } else if (IMAGE_ASPECT_VALUES.has(v)) {
            onImageSizeChange(null);
            onImageAspectRatioChange(v);
          } else {
            onImageSizeChange(null);
            onImageAspectRatioChange("auto");
          }
        }}
      >
        <SelectTrigger
          className="h-8 min-w-20 w-fit border border-input text-xs text-muted-foreground"
          title="Image aspect / size"
        >
          <SelectValue placeholder="Aspect" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {IMAGE_ASPECT_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                disabled={!supportedAspectRatios.has(o.value)}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Size</SelectLabel>
            {IMAGE_SIZE_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={o.value}
                disabled={o.value !== "default" && !supportedSizes.has(o.value)}
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
