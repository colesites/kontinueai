import type { Platform } from "../types";

const PLATFORM_PATTERNS: Array<{ patterns: RegExp[]; platform: Platform }> = [
  { patterns: [/chat\.openai\.com\/share/, /chatgpt\.com\/share/], platform: "chatgpt" },
  { patterns: [/claude\.ai\/share/, /claude\.com\/share/], platform: "claude" },
  { patterns: [/gemini\.google\.com\/share/, /g\.co\/gemini\/share/], platform: "gemini" },
  { patterns: [/perplexity\.ai\/search/, /perplexity\.ai\/share/], platform: "perplexity" },
  { patterns: [/t3\.chat\/share/, /t3\.chat\/c\//], platform: "t3chat" },
  { patterns: [/chat\.deepseek\.com\/share/], platform: "deepseek" },
  { patterns: [/copilot\.microsoft\.com/, /bing\.com\/chat/], platform: "copilot" },
  { patterns: [/qwen\.ai/, /tongyi\.aliyun\.com\/share/], platform: "qwen" },
  { patterns: [/manus\.ai\/share/, /manus\.im\/share/], platform: "manus" },
  { patterns: [/grok\.com\/share/, /x\.com\/i\/grok/], platform: "grok" },
  { patterns: [/kimi\.com\/share/, /kimi\.moonshot\.cn\/share/], platform: "kimi" },
  { patterns: [/meta\.ai\/share/], platform: "metaai" },
];

export const SUPPORTED_PLATFORMS: Platform[] = [
  "chatgpt", "claude", "gemini", "perplexity",
  "t3chat", "deepseek", "copilot", "qwen", "manus", "grok",
  "kimi", "metaai",
];

export class UnsupportedPlatformError extends Error {
  constructor(url: string) {
    super(`Unsupported platform: ${url}`);
    this.name = "UnsupportedPlatformError";
  }
}

export function detectPlatform(url: string): Platform {
  for (const { patterns, platform } of PLATFORM_PATTERNS) {
    if (patterns.some((p) => p.test(url))) {
      return platform;
    }
  }
  throw new UnsupportedPlatformError(url);
}
