import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { deriveCapabilities } from "@repo/ai/lib/model-capabilities";
import type { AiGatewayModel, OpenAIImageSize } from "./types";
import { modelSupportsTools } from "./model-utils";
import { toOpenAIImageSize } from "./request-utils";

/**
 * Validates that a string is an IANA timezone the runtime recognises.
 * Avoids passing junk like "local", "user", or "UTC+1" to the widget.
 */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the get_current_time tool with the user's true local timezone baked in
 * as the default. The model can still override it (e.g. "what time is it in Tokyo?")
 * — but if it doesn't, we use the client-reported zone instead of letting the
 * model guess (which usually goes badly: many models default to Asia/Kolkata or UTC).
 */
function makeGetCurrentTimeTool(userTimezone: string | null) {
  const fallbackZone =
    userTimezone && isValidTimezone(userTimezone) ? userTimezone : null;

  return tool({
    description: [
      "Get the current real-world time and render a clock widget.",
      "",
      "Call this whenever the user asks about the current time, date, hour, day of week, or anything tied to 'now'.",
      "",
      "TIMEZONE PARAMETER:",
      "- Only set `timezone` if the user explicitly names a different location (e.g. 'what time is it in Tokyo' → 'Asia/Tokyo').",
      "- For 'what time is it', 'what's today's date', 'is it morning' etc., DO NOT set timezone. The server already knows the user's local zone and will use it automatically.",
      "- Never invent a timezone. Never pass 'local', 'user', or 'UTC' as a default.",
      "",
      "RESPONSE STYLE: The clock widget displays the time visually. Don't restate the digits. A short line like 'Here you go:' is fine.",
    ].join("\n"),
    inputSchema: z.object({
      timezone: z
        .string()
        .optional()
        .describe(
          'IANA timezone (e.g. "Asia/Tokyo"). Only set this when the user explicitly asks about a non-local zone. Omit otherwise — the server uses the user\'s real local timezone automatically.',
        ),
    }),
    execute: async ({ timezone }) => {
      // Priority: explicit valid model arg → known user zone → null (widget falls back to client local)
      let resolved: string | null = null;
      if (timezone && isValidTimezone(timezone)) {
        resolved = timezone;
      } else if (fallbackZone) {
        resolved = fallbackZone;
      }
      return {
        iso: new Date().toISOString(),
        timezone: resolved,
      };
    },
  });
}
import {
  buildMemoryContext,
  buildResponseBudgetContext,
  buildImageGenerationContext,
  buildWebSearchContext,
  CHAT_SYSTEM_PROMPT,
  isLikelyImageRequest,
  isLikelyWebSearchRequest,
  looksLikeSportsPlayerQuery,
} from "./prompt";

export type ToolsConfigResult = {
  tools: ToolSet;
  hasImageGen: boolean;
  hasWebSearch: boolean;
  supportsTools: boolean;
  provider: string;
  shouldAttachWebSearchTool: boolean;
  canUseOpenAIImageTool: boolean;
  openaiImageToolSize: OpenAIImageSize | null;
  systemPrompt: string;
  forceImageTool: boolean;
  forceWebSearchTool: boolean;
};

export function buildToolsAndPrompt(options: {
  requestedModel: AiGatewayModel;
  modelId: string;
  webSearchEnabled: boolean;
  lastUserContent: string;
  maxOutputTokens: number;
  imageAspectRatio?: string | null;
  imageSize?: string | null;
  apiKey: string;
  gatewayOpenAIBaseUrl: string;
  userTimezone?: string | null;
  memoryContextText?: string | null;
}): ToolsConfigResult {
  const {
    requestedModel,
    modelId,
    webSearchEnabled,
    lastUserContent,
    maxOutputTokens,
    imageAspectRatio,
    imageSize,
    apiKey,
    gatewayOpenAIBaseUrl,
    userTimezone,
    memoryContextText,
  } = options;

  const capabilities = deriveCapabilities(requestedModel);
  const hasImageGen = capabilities.includes("image-generation");
  const hasWebSearch = capabilities.includes("web-search");
  const supportsTools = modelSupportsTools(requestedModel);
  const provider = modelId.split("/")[0] ?? "";

  const tools: ToolSet = {};
  const shouldAttachWebSearchTool = webSearchEnabled && supportsTools;
  const sportsPlayerQuery = looksLikeSportsPlayerQuery(lastUserContent);

  // Always-available lightweight time tool for any model that supports tools.
  // The user's actual local zone is captured in the closure so the model never
  // has to guess (and we override it to "local" when it picks something silly
  // like UTC or Asia/Kolkata).
  if (supportsTools) {
    tools.get_current_time = makeGetCurrentTimeTool(userTimezone ?? null);
  }

  if (webSearchEnabled && !hasWebSearch) {
    console.warn(
      `[chat-debug] model metadata does not report web-search capability for ${modelId}; attaching perplexity_search tool optimistically`,
    );
  }

  if (shouldAttachWebSearchTool) {
    tools.perplexity_search = gateway.tools.perplexitySearch({
      searchRecencyFilter: sportsPlayerQuery ? "year" : "month",
      maxResults: 5,
      maxTokensPerPage: 512,
      maxTokens: 4000,
      ...(sportsPlayerQuery
        ? {
            searchDomainFilter: [
              "espn.com",
              "fbref.com",
              "whoscored.com",
              "sofascore.com",
              "premierleague.com",
              "chelseafc.com",
            ],
          }
        : {}),
    });
  }

  const canUseOpenAIImageTool = hasImageGen && provider === "openai";
  let openaiImageToolSize: OpenAIImageSize | null = null;
  if (canUseOpenAIImageTool) {
    const size = toOpenAIImageSize(imageAspectRatio, imageSize);
    openaiImageToolSize = size;
    const openaiViaGateway = createOpenAI({
      apiKey,
      baseURL: gatewayOpenAIBaseUrl,
    });
    tools.image_generation = openaiViaGateway.tools.imageGeneration({
      outputFormat: "webp",
      quality: "high",
      size: size === "auto" ? "auto" : size,
    });
  }

  const webSearchContext = buildWebSearchContext({
    webSearchEnabled,
    shouldAttachWebSearchTool,
  });
  const responseBudgetContext = buildResponseBudgetContext({ maxOutputTokens });
  const imageGenContext = buildImageGenerationContext({
    canUseOpenAIImageTool,
    hasImageGen,
    modelId,
    imageAspectRatio,
    imageSize,
  });
  const systemPrompt =
    CHAT_SYSTEM_PROMPT +
    responseBudgetContext +
    webSearchContext +
    imageGenContext +
    buildMemoryContext(memoryContextText ?? null);

  const forceImageTool =
    hasImageGen &&
    provider === "openai" &&
    !!tools.image_generation &&
    isLikelyImageRequest(lastUserContent);
  const forceWebSearchTool =
    shouldAttachWebSearchTool &&
    !!tools.perplexity_search &&
    isLikelyWebSearchRequest(lastUserContent);

  return {
    tools,
    hasImageGen,
    hasWebSearch,
    supportsTools,
    provider,
    shouldAttachWebSearchTool,
    canUseOpenAIImageTool,
    openaiImageToolSize,
    systemPrompt,
    forceImageTool,
    forceWebSearchTool,
  };
}
