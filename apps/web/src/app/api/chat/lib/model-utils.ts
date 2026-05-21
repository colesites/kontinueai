import type { AiGatewayModel } from "./types";

export function modelSupportsTools(model: AiGatewayModel): boolean {
  if (model.type && model.type !== "language") return false;

  const lowerTags = (model.tags ?? []).map((tag) => tag.toLowerCase());
  const hasToolTag = lowerTags.some(
    (tag) =>
      tag.includes("tool") ||
      tag.includes("function-calling") ||
      tag.includes("function_calling"),
  );

  const pricing = model.pricing ?? {};
  const hasWebSearchPricing =
    typeof pricing === "object" &&
    pricing !== null &&
    "web_search" in pricing &&
    String((pricing as Record<string, unknown>).web_search) !== "0";

  return hasToolTag || hasWebSearchPricing || model.type === "language" || !model.type;
}

let cachedModels: AiGatewayModel[] | null = null;
let cachedModelsAtMs = 0;

export async function getAiGatewayModelsCached(): Promise<AiGatewayModel[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModelsAtMs < 5 * 60_000) {
    return cachedModels;
  }

  const response = await fetch("https://ai-gateway.vercel.sh/v1/models");
  if (!response.ok) {
    throw new Error(`Failed to fetch AI Gateway models: ${response.status}`);
  }

  const json = (await response.json()) as { data?: AiGatewayModel[] };
  cachedModels = json.data ?? [];
  cachedModelsAtMs = now;
  return cachedModels;
}
