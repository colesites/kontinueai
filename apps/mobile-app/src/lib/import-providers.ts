/**
 * Shared-link provider detection for the import dialog and sidebar badges.
 *
 * Mirrors `@repo/utils/url-safety` (detectProvider + PROVIDER_CONFIG) and web's
 * MODEL_PROVIDER_MAP. That package's exports map points `./*` at `.tsx`, so its
 * `.ts` modules don't resolve under Metro's strict package exports; the parity
 * test (`import-providers.test.ts`) fails the moment the two drift.
 */

export type Provider =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "t3chat"
  | "perplexity"
  | "mistral"
  | "unknown";

export function detectProvider(url: string): Provider {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes("chat.openai.com") || hostname.includes("chatgpt.com"))
      return "chatgpt";
    if (hostname.includes("claude.ai") || hostname.includes("anthropic.com"))
      return "claude";
    // Gemini shares live on share.gemini.google now; the older
    // gemini.google.com/share and g.co/gemini/share forms still exist.
    if (
      hostname === "gemini.google" ||
      hostname.endsWith(".gemini.google") ||
      hostname.includes("gemini.google.com") ||
      hostname.includes("aistudio.google.com") ||
      (hostname === "g.co" && parsed.pathname.startsWith("/gemini"))
    )
      return "gemini";
    if (hostname.includes("t3chat.com")) return "t3chat";
    if (hostname.includes("perplexity.ai")) return "perplexity";
    if (hostname.includes("mistral.ai")) return "mistral";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Provider brand colors: allowed literals per WEB_PARITY.md. */
export const PROVIDER_CONFIG: Record<Provider, { name: string; color: string }> =
  {
    chatgpt: { name: "ChatGPT", color: "#10a37f" },
    claude: { name: "Claude", color: "#cc785c" },
    gemini: { name: "Gemini", color: "#4285f4" },
    t3chat: { name: "T3Chat", color: "#f8e6f4" },
    perplexity: { name: "Perplexity", color: "#20b8cd" },
    mistral: { name: "Mistral", color: "#ffffff" },
    unknown: { name: "Unknown", color: "#6b7280" },
  };

/** Model vendor → chat provider tag, mirroring web's MODEL_PROVIDER_MAP. */
export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  openai: "chatgpt",
  anthropic: "claude",
  google: "gemini",
  deepseek: "unknown",
  minimax: "unknown",
  mistral: "mistral",
  perplexity: "perplexity",
  zai: "unknown",
  alibaba: "unknown",
};
