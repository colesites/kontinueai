export const IMAGE_ASPECT_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "7:3", label: "7:3" },
  { value: "4:1", label: "4:1" },
  { value: "21:9", label: "21:9" },
  { value: "16:9", label: "16:9" },
  { value: "5:3", label: "5:3" },
  { value: "5:4", label: "5:4" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "9:7", label: "9:7" },
  { value: "9:16", label: "9:16" },
  { value: "4:5", label: "4:5" },
  { value: "2:3", label: "2:3" },
  { value: "3:4", label: "3:4" },
  { value: "1:2", label: "1:2" },
  { value: "1:4", label: "1:4" },
  { value: "1:9", label: "1:9" },
  { value: "3:7", label: "3:7" },
  { value: "9:21", label: "9:21" },
];

export const IMAGE_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "256x256", label: "256×256" },
  { value: "512x512", label: "512×512" },
  { value: "768x768", label: "768×768" },
  { value: "1024x768", label: "1024×768" },
  { value: "1024x1024", label: "1024×1024" },
  { value: "1536x1024", label: "1536×1024" },
  { value: "1024x1536", label: "1024×1536" },
  { value: "1792x1024", label: "1792×1024" },
  { value: "1024x1792", label: "1024×1792" },
  { value: "1365x1024", label: "1365×1024" },
  { value: "1024x1365", label: "1024×1365" },
  { value: "1820x1024", label: "1820×1024" },
  { value: "1024x1820", label: "1024×1820" },
  { value: "2048x1024", label: "2048×1024" },
  { value: "1024x2048", label: "1024×2048" },
  { value: "1707x1024", label: "1707×1024" },
  { value: "1024x1707", label: "1024×1707" },
  { value: "1434x1024", label: "1434×1024" },
  { value: "1024x1434", label: "1024×1434" },
  { value: "1280x1024", label: "1280×1024" },
  { value: "1024x1280", label: "1024×1280" },
  { value: "640x1536", label: "640×1536" },
  { value: "768x1344", label: "768×1344" },
  { value: "832x1216", label: "832×1216" },
  { value: "896x1152", label: "896×1152" },
  { value: "1152x896", label: "1152×896" },
  { value: "1216x832", label: "1216×832" },
  { value: "1344x768", label: "1344×768" },
  { value: "1536x640", label: "1536×640" },
];

export const IMAGE_ASPECT_VALUES = new Set(IMAGE_ASPECT_OPTIONS.map((o) => o.value));
export const IMAGE_SIZE_VALUES = new Set(
  IMAGE_SIZE_OPTIONS.map((o) => o.value).filter((v) => v !== "default"),
);

export const OPENAI_SUPPORTED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);
export const OPENAI_SUPPORTED_ASPECTS = new Set([
  "auto",
  "1:1",
  "21:9",
  "16:9",
  "5:4",
  "4:3",
  "3:2",
  "9:16",
  "4:5",
  "2:3",
  "3:4",
  "9:21",
  "1:9",
  "7:3",
  "3:7",
]);
export const GOOGLE_SUPPORTED_ASPECTS = new Set([
  "auto",
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
]);

export function getSupportedImageOptions(modelId?: string) {
  if (!modelId) {
    return {
      aspectRatios: new Set<string>(["auto"]),
      sizes: new Set<string>([]),
    };
  }

  // OpenAI image_generation tool options (AI SDK OpenAI tool contract).
  if (modelId.startsWith("openai/")) {
    return {
      aspectRatios: OPENAI_SUPPORTED_ASPECTS,
      sizes: OPENAI_SUPPORTED_SIZES,
    };
  }

  // Google Gemini/Imagen image generation ratios via AI SDK.
  if (modelId.startsWith("google/")) {
    return {
      aspectRatios: GOOGLE_SUPPORTED_ASPECTS,
      sizes: new Set<string>([]),
    };
  }

  return {
    aspectRatios: new Set<string>(["auto"]),
    sizes: new Set<string>([]),
  };
}
