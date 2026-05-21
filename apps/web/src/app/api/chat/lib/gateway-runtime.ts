export type GatewayRuntimeConfig = {
  apiKey: string;
  gatewayOpenAIBaseUrl: string;
};

export function getGatewayRuntimeConfig(): GatewayRuntimeConfig | null {
  const hasVercelGatewayApiKey = !!process.env.VERCEL_AI_GATEWAY_API_KEY;
  const hasAiGatewayApiKey = !!process.env.AI_GATEWAY_API_KEY;
  const hasAiGatewayToken = !!process.env.AI_GATEWAY_TOKEN;

  console.log(
    "[chat-debug] VERCEL_AI_GATEWAY_API_KEY defined",
    hasVercelGatewayApiKey,
  );
  console.log("[chat-debug] AI_GATEWAY_API_KEY defined", hasAiGatewayApiKey);
  console.log("[chat-debug] AI_GATEWAY_TOKEN defined", hasAiGatewayToken);

  const apiKey =
    process.env.VERCEL_AI_GATEWAY_API_KEY ??
    process.env.AI_GATEWAY_API_KEY ??
    process.env.AI_GATEWAY_TOKEN;

  if (!apiKey) {
    console.error("Chat API misconfigured: missing AI gateway credentials.");
    return null;
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    process.env.AI_GATEWAY_API_KEY = apiKey;
  }

  const gatewayBaseUrl = "https://ai-gateway.vercel.sh/v3/ai";
  const gatewayOpenAIBaseUrl =
    process.env.AI_GATEWAY_OPENAI_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
  const ignoredGatewayBaseUrlOverride = process.env.AI_GATEWAY_BASE_URL ?? null;
  const directPerplexityBaseUrlOverride =
    process.env.PERPLEXITY_BASE_URL ?? process.env.PERPLEXITY_API_BASE_URL ?? null;

  console.log("[chat-debug] gateway routing", {
    gatewayBaseUrl,
    gatewayOpenAIBaseUrl,
    usingAiGateway: true,
    ignoredGatewayBaseUrlOverride,
    directPerplexityBaseUrlOverride,
  });

  if (directPerplexityBaseUrlOverride) {
    console.warn(
      "[chat-debug] Direct Perplexity base URL override is present. This can bypass AI Gateway if used elsewhere.",
    );
  }

  return { apiKey, gatewayOpenAIBaseUrl };
}
