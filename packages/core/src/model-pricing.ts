export type AiGatewayModel = {
  id: string;
  type?: "language" | "embedding" | "image" | "video" | string;
  tags?: string[];
  pricing?: Record<string, unknown>;
};

type PricingTier = {
  cost?: string | number;
  min?: number;
  max?: number;
};

export const FREE_MODEL_INPUT_TOKENS = 100;
export const FREE_MODEL_OUTPUT_TOKENS = 200;
export const PRO_MODEL_INPUT_PRICE_PER_MILLION_USD = 2;
export const PRO_MODEL_OUTPUT_PRICE_PER_MILLION_USD = 6;

function parsePricePerToken(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function toPricePerMillion(pricePerToken: number): number {
  return pricePerToken * 1_000_000;
}

function hasImageGenerationCapability(model: AiGatewayModel): boolean {
  if (Array.isArray(model.tags) && model.tags.includes("image-generation")) {
    return true;
  }

  const pricing = model.pricing;
  if (!pricing || typeof pricing !== "object") return false;

  return "image" in pricing || "image_output" in pricing;
}

function isPricingTier(value: unknown): value is PricingTier {
  return typeof value === "object" && value !== null;
}

function getTieredPricePerToken(
  tiers: unknown,
  tokenCount: number,
): number | null {
  if (!Array.isArray(tiers)) return null;

  for (const tier of tiers) {
    if (!isPricingTier(tier)) continue;

    const min = typeof tier.min === "number" ? tier.min : 0;
    const max = typeof tier.max === "number" ? tier.max : Infinity;

    if (tokenCount >= min && tokenCount < max) {
      return parsePricePerToken(tier.cost);
    }
  }

  return null;
}

function getPricePerToken(
  pricing: Record<string, unknown>,
  baseKey: string,
  tierKeys: string[],
  tokenCount: number,
): number | null {
  for (const tierKey of tierKeys) {
    const tierPrice = getTieredPricePerToken(pricing[tierKey], tokenCount);
    if (tierPrice !== null) return tierPrice;
  }

  return parsePricePerToken(pricing[baseKey]);
}

export function isProModel(model: AiGatewayModel): boolean {
  if (hasImageGenerationCapability(model)) return true;
  if (model.type !== "language") return false;

  const pricing = model.pricing;
  if (!pricing || typeof pricing !== "object") return true;

  const inputPricePerToken = getPricePerToken(
    pricing,
    "input",
    ["input_tiers", "inputTiers"],
    FREE_MODEL_INPUT_TOKENS,
  );
  const outputPricePerToken = getPricePerToken(
    pricing,
    "output",
    ["output_tiers", "outputTiers"],
    FREE_MODEL_OUTPUT_TOKENS,
  );

  if (inputPricePerToken === null || outputPricePerToken === null) {
    return true;
  }

  return (
    toPricePerMillion(inputPricePerToken) > PRO_MODEL_INPUT_PRICE_PER_MILLION_USD ||
    toPricePerMillion(outputPricePerToken) >
      PRO_MODEL_OUTPUT_PRICE_PER_MILLION_USD
  );
}
