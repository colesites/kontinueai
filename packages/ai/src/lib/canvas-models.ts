/**
 * Canvas-specific models for image and video generation.
 * These are separate from chat models and do NOT appear in the chat model selector.
 * All routed through Vercel AI Gateway.
 */

export interface CanvasModel {
  id: string;
  name: string;
  provider: string;
  capability: "image" | "video";
  description: string;
  isFree?: boolean;
  resolutions?: { value: string; label: string }[];
}

// ── Image Generation Models ───────────────────────────────
// ── Image Generation Models ───────────────────────────────
export const IMAGE_MODELS: CanvasModel[] = [
  // xAI
  {
    id: "xai/grok-imagine-image-pro",
    name: "Grok Imagine Pro",
    provider: "xAI",
    capability: "image",
    description: "xAI's pro image generation model.",
  },
  {
    id: "xai/grok-imagine-image",
    name: "Grok Imagine",
    provider: "xAI",
    capability: "image",
    description: "Standard Grok image generation.",
  },

  // Google
  {
    id: "google/gemini-3.1-flash-image-preview",
    name: "Nano Banana 2",
    provider: "Google",
    capability: "image",
    description: "Google's latest preview model for image generation.",
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Nano Banana",
    provider: "Google",
    capability: "image",
    description: "Fast Gemini 2.5 image generation.",
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Nano Banana Pro",
    provider: "Google",
    capability: "image",
    description: "Pro-tier image generation from Google.",
  },
  {
    id: "google/imagen-4.0-fast-generate-001",
    name: "Imagen 4 Generate",
    provider: "Google",
    capability: "image",
    description: "Fast Imagen 4 generation.",
  },
  {
    id: "google/imagen-4.0-ultra-generate-001",
    name: "Imagen 4 Ultra Generate",
    provider: "Google",
    capability: "image",
    description: "Highest quality Imagen 4 model.",
  },
  {
    id: "google/imagen-4.0-generate-001",
    name: "Imagen 4",
    provider: "Google",
    capability: "image",
    description: "Standard Imagen 4 generation.",
  },

  // OpenAI
  {
    id: "openai/gpt-5-pro",
    name: "GPT 5 Pro",
    provider: "OpenAI",
    capability: "image",
    description: "Pro-tier GPT 5 generation.",
  },
  {
    id: "openai/gpt-5",
    name: "GPT 5",
    provider: "OpenAI",
    capability: "image",
    description: "OpenAI's latest generation model.",
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT 5 Nano",
    provider: "OpenAI",
    capability: "image",
    description: "Lightweight GPT 5 image generation.",
  },
  {
    id: "openai/gpt-5.1-thinking",
    name: "GPT 5.1 Thinking",
    provider: "OpenAI",
    capability: "image",
    description: "Advanced reasoning-based image generation.",
  },
  {
    id: "openai/gpt-image-1.5",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    capability: "image",
    description: "OpenAI's image generation model 1.5.",
  },
  {
    id: "openai/gpt-image-1",
    name: "GPT Image 1",
    provider: "OpenAI",
    capability: "image",
    description: "Core GPT image generation.",
  },
  {
    id: "openai/gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    provider: "OpenAI",
    capability: "image",
    description: "Fast, compact image generation from OpenAI.",
  },

  // Black Forest Labs
  {
    id: "bfl/flux-pro-1.1-ultra",
    name: "FLUX1.1 Pro Ultra",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Ultra-high performance FLUX 1.1.",
  },
  {
    id: "bfl/flux-pro-1.1",
    name: "FLUX1.1 Pro",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Standard FLUX 1.1 Pro.",
  },
  {
    id: "bfl/flux-2-pro",
    name: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Advanced FLUX 2 Pro generation.",
  },
  {
    id: "bfl/flux-2-max",
    name: "FLUX.2 Max",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Maximum performance FLUX 2.",
  },
  {
    id: "bfl/flux-2-flex",
    name: "FLUX.2 Flex",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Flexible FLUX 2 model.",
  },
  {
    id: "bfl/flux-2-klein-9b",
    name: "FLUX.2 Klein 9B",
    provider: "Black Forest Labs",
    capability: "image",
    description: "9B parameter Klein model.",
  },
  {
    id: "bfl/flux-2-klein-4b",
    name: "FLUX.2 Klein 4B",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Compact 4B parameter Klein model.",
  },
  {
    id: "bfl/flux-kontext-max",
    name: "FLUX.1 Kontext Max",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Highest capacity context-aware model.",
  },
  {
    id: "bfl/flux-kontext-pro",
    name: "FLUX.1 Kontext Pro",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Context-aware pro image generation.",
  },
  {
    id: "bfl/flux-pro-1.0-fill",
    name: "FLUX.1 Fill Pro",
    provider: "Black Forest Labs",
    capability: "image",
    description: "Generative fill model from BFL.",
  },

  // Recraft
  {
    id: "recraft/recraft-v4-pro",
    name: "Recraft v4 Pro",
    provider: "Recraft",
    capability: "image",
    description: "Professional grade image generation from Recraft.",
  },
  {
    id: "recraft/recraft-v4",
    name: "Recraft v4",
    provider: "Recraft",
    capability: "image",
    description: "Standard Recraft v4 image generation.",
  },
  {
    id: "recraft/recraft-v3",
    name: "Recraft v3",
    provider: "Recraft",
    capability: "image",
    description: "Proven Recraft v3 generation.",
  },
  {
    id: "recraft/recraft-v2",
    name: "Recraft v2",
    provider: "Recraft",
    capability: "image",
    description: "Legacy Recraft v2 model.",
  },
];

// ── Video Generation Models ───────────────────────────────
export const VIDEO_MODELS: CanvasModel[] = [
  // xAI
  {
    id: "xai/grok-imagine-video",
    name: "Grok Imagine Video",
    provider: "xAI",
    capability: "video",
    description: "Text-to-video generation from xAI.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
    ],
  },

  // KlingAI
  {
    id: "klingai/kling-v3.0-t2v",
    name: "Kling 3.0 (Text-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "KlingAI's latest text-to-video model.",
  },
  {
    id: "klingai/kling-v3.0-i2v",
    name: "Kling 3.0 (Image-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "KlingAI's latest image-to-video model.",
  },
  {
    id: "klingai/kling-v2.6-t2v",
    name: "Kling 2.6 (Text-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "Enhanced text-to-video from KlingAI.",
  },
  {
    id: "klingai/kling-v2.6-i2v",
    name: "Kling 2.6 (Image-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "Enhanced image-to-video from KlingAI.",
  },
  {
    id: "klingai/kling-v2.6-motion-control",
    name: "Kling 2.6 Motion Control",
    provider: "KlingAI",
    capability: "video",
    description: "Video generation with advanced motion control.",
  },
  {
    id: "klingai/kling-v2.5-turbo-t2v",
    name: "Kling 2.5 Turbo (Text-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "Turbo text-to-video generation.",
  },
  {
    id: "klingai/kling-v2.5-turbo-i2v",
    name: "Kling 2.5 Turbo (Image-to-Video)",
    provider: "KlingAI",
    capability: "video",
    description: "Turbo image-to-video generation.",
  },

  // Alibaba
  {
    id: "alibaba/wan-v2.6-t2v",
    name: "Wan 2.6 (Text-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Alibaba's advanced text-to-video model.",
    isFree: true,
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "alibaba/wan-v2.6-i2v",
    name: "Wan 2.6 (Image-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Alibaba's advanced image-to-video model.",
    isFree: true,
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "alibaba/wan-v2.6-i2v-flash",
    name: "Wan 2.6 Flash (Image-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Fast image-to-video generation.",
    isFree: true,
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "alibaba/wan-v2.6-r2v",
    name: "Wan 2.6 (Real-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Real-to-video generation from Alibaba.",
    isFree: true,
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "alibaba/wan-v2.6-r2v-flash",
    name: "Wan 2.6 Flash (Real-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Fast real-to-video generation.",
    isFree: true,
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "alibaba/wan-v2.5-t2v-preview",
    name: "Wan 2.5 Preview (Text-to-Video)",
    provider: "Alibaba",
    capability: "video",
    description: "Preview text-to-video model from Alibaba.",
    isFree: true,
    resolutions: [
      { value: "848x480", label: "480P" },
      { value: "1280x720", label: "720P" },
    ],
  },

  // ByteDance
  {
    id: "bytedance/seedance-v1.5-pro",
    name: "Seedance 1.5 Pro",
    provider: "ByteDance",
    capability: "video",
    description: "High-quality video from ByteDance.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "bytedance/seedance-v1.0-pro",
    name: "Seedance 1.0 Pro",
    provider: "ByteDance",
    capability: "video",
    description: "Professional video generation from ByteDance.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "bytedance/seedance-v1.0-pro-fast",
    name: "Seedance 1.0 Pro Fast",
    provider: "ByteDance",
    capability: "video",
    description: "Fast professional video generation.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "bytedance/seedance-v1.0-lite-t2v",
    name: "Seedance 1.0 Lite (Text-to-Video)",
    provider: "ByteDance",
    capability: "video",
    description: "Lightweight text-to-video generation.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "bytedance/seedance-v1.0-lite-i2v",
    name: "Seedance 1.0 Lite (Image-to-Video)",
    provider: "ByteDance",
    capability: "video",
    description: "Lightweight image-to-video generation.",
    resolutions: [
      { value: "854x480", label: "480P" },
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },

  // Google
  {
    id: "google/veo-3.1-generate-001",
    name: "Veo 3.1",
    provider: "Google",
    capability: "video",
    description: "Google's latest 3.1 generation video model.",
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "google/veo-3.1-fast-generate-001",
    name: "Veo 3.1 Fast",
    provider: "Google",
    capability: "video",
    description: "Fast 3.1 generation from Google.",
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "google/veo-3.0-generate-001",
    name: "Veo 3.0",
    provider: "Google",
    capability: "video",
    description: "Google's 3.0 generation video model.",
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
  {
    id: "google/veo-3.0-fast-generate-001",
    name: "Veo 3.0 Fast",
    provider: "Google",
    capability: "video",
    description: "Fast 3.0 generation from Google.",
    resolutions: [
      { value: "1280x720", label: "720P" },
      { value: "1920x1080", label: "1080P" },
    ],
  },
];

export const DEFAULT_IMAGE_MODEL = "xai/grok-imagine-image";
export const DEFAULT_VIDEO_MODEL = "alibaba/wan-v2.6-t2v";

export function getCanvasModelById(id: string): CanvasModel | undefined {
  return [...IMAGE_MODELS, ...VIDEO_MODELS].find((m) => m.id === id);
}

export const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "21:9", label: "21:9" },
] as const;

export type AspectRatioValue = (typeof ASPECT_RATIOS)[number]["value"];

export const PROVIDER_RATIOS: Record<string, AspectRatioValue[]> = {
  Google: ["16:9", "9:16"],
  KlingAI: ["16:9", "9:16", "1:1"],
  xAI: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
  ByteDance: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
};

export function isRatioSupported(provider: string, ratio: string): boolean {
  const supported = PROVIDER_RATIOS[provider];
  if (!supported) return true; // Default to all if provider not listed
  return supported.includes(ratio as AspectRatioValue);
}

export const VIDEO_DURATIONS = [2, 3, 4, 5, 6, 8, 10, 12, 15] as const;

export function isDurationSupported(
  modelId: string,
  duration: number,
): boolean {
  // Alibaba Wan
  if (modelId.includes("wan-v2.5")) {
    return [5, 10].includes(duration);
  }
  if (modelId.includes("wan-v2.6")) {
    return duration >= 2 && duration <= 15;
  }

  // Google Veo
  if (modelId.includes("google/veo")) {
    return [4, 6, 8].includes(duration);
  }

  // KlingAI
  if (modelId.includes("klingai/kling-v3.0")) {
    return duration >= 3 && duration <= 15;
  }
  if (modelId.includes("klingai/kling-v2")) {
    return [5, 10].includes(duration);
  }

  // xAI Grok
  if (modelId.includes("xai/grok")) {
    return [5, 10, 15].includes(duration);
  }

  // ByteDance Seedance
  if (modelId.includes("seedance-v1.5")) {
    return duration >= 4 && duration <= 12;
  }
  if (modelId.includes("seedance-v1.0")) {
    return duration >= 2 && duration <= 12;
  }

  // Default for other models
  return [5, 10, 15].includes(duration);
}
