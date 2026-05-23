import type { PlanTier } from "./plan-tier";

export const MEMORY_PLAN_LIMIT_BYTES = {
  free: 512 * 1024,
  starter: 2 * 1024 * 1024 * 1024,
  pro: 4 * 1024 * 1024 * 1024,
} as const;

export const MEMORY_EMBEDDING_DIMENSIONS = 1536;
export const MEMORY_EMBEDDING_MODEL =
  process.env.MEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const MEMORY_CONTEXT_TOKEN_BUDGET = 2400;
export const MEMORY_CONTEXT_RESULT_LIMIT = 8;

export const MEMORY_TYPES = [
  "preference",
  "personal_fact",
  "project",
  "long_term",
  "summary",
  "workflow",
  "relationship",
  "context",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryQuotaState = {
  canStore: boolean;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usagePercent: number;
  warning: string | null;
};

const encoder = new TextEncoder();

export function getMemoryLimitBytesForPlan(plan?: string | null): number {
  const normalized = plan?.toLowerCase().trim() ?? "";
  const tier: PlanTier =
    normalized === "pro_plan" ||
    normalized === "pro-plan" ||
    normalized === "pro_plus" ||
    normalized === "proplus" ||
    normalized === "pro_v2"
      ? "pro"
      : normalized === "starter" ||
          normalized === "starter_plan" ||
          normalized === "starter-plan" ||
          normalized === "pro"
        ? "starter"
        : "free";
  return MEMORY_PLAN_LIMIT_BYTES[tier];
}

export function computeMemoryQuotaState(args: {
  usedBytes: number;
  limitBytes: number;
}): MemoryQuotaState {
  const usedBytes = Math.max(0, args.usedBytes);
  const limitBytes = Math.max(1, args.limitBytes);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const usagePercent = Math.min(100, (usedBytes / limitBytes) * 100);
  return {
    canStore: usedBytes < limitBytes,
    usedBytes,
    limitBytes,
    remainingBytes,
    usagePercent,
    warning:
      usedBytes >= limitBytes
        ? "Memory storage is full. New chats still work, but new memories will not be saved until space is freed."
        : null,
  };
}

export function estimateMemoryByteSize(args: {
  content: string;
  compressedContent?: string | null;
  embeddingLength?: number;
  metadata?: Record<string, unknown> | null;
}): number {
  const rawBytes = encoder.encode(args.content).byteLength;
  const compressedBytes = args.compressedContent
    ? encoder.encode(args.compressedContent).byteLength
    : 0;
  const embeddingBytes = (args.embeddingLength ?? 0) * 8;
  const metadataBytes = args.metadata
    ? encoder.encode(JSON.stringify(args.metadata)).byteLength
    : 96;
  return rawBytes + compressedBytes + embeddingBytes + metadataBytes;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function tokenizeForKeywordSearch(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  ).slice(0, 20);
}

export function scoreRecency(timestampMs: number, nowMs = Date.now()): number {
  const ageHours = Math.max(0, nowMs - timestampMs) / 3_600_000;
  return 1 / (1 + ageHours / 24);
}

export function computeMemoryRetrievalScore(args: {
  vectorSimilarity: number;
  importanceScore: number;
  recencyScore: number;
}): number {
  return (
    Math.max(0, args.vectorSimilarity) * 0.5 +
    clampImportanceScore(args.importanceScore) * 0.3 +
    Math.max(0, args.recencyScore) * 0.2
  );
}

export function clampImportanceScore(score: number): number {
  if (!Number.isFinite(score)) return 0.5;
  return Math.min(1, Math.max(0, score));
}

export function memoryTypeLabel(type: MemoryType): string {
  switch (type) {
    case "preference":
      return "Preference";
    case "personal_fact":
      return "Personal Fact";
    case "project":
      return "Project";
    case "long_term":
      return "Long-term";
    case "summary":
      return "Summary";
    case "workflow":
      return "Workflow";
    case "relationship":
      return "Relationship";
    case "context":
      return "Context";
  }
}
