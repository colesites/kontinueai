import { describe, expect, test } from "bun:test";
import {
  computeMemoryQuotaState,
  computeMemoryRetrievalScore,
  estimateMemoryByteSize,
  getMemoryLimitBytesForPlan,
  tokenizeForKeywordSearch,
} from "./memory";

describe("memory helpers", () => {
  test("resolves memory limits by plan", () => {
    expect(getMemoryLimitBytesForPlan("free")).toBe(512 * 1024);
    expect(getMemoryLimitBytesForPlan("starter_plan")).toBe(
      2 * 1024 * 1024 * 1024,
    );
    expect(getMemoryLimitBytesForPlan("pro_plan")).toBe(
      4 * 1024 * 1024 * 1024,
    );
  });

  test("reports quota exhaustion without breaking chat semantics", () => {
    const quota = computeMemoryQuotaState({
      usedBytes: 1024,
      limitBytes: 1024,
    });

    expect(quota.canStore).toBe(false);
    expect(quota.remainingBytes).toBe(0);
    expect(quota.warning).toContain("Memory storage is full");
  });

  test("estimates byte size with embedding and metadata overhead", () => {
    const byteSize = estimateMemoryByteSize({
      content: "I prefer dark mode",
      compressedContent: "prefer dark mode",
      embeddingLength: 4,
      metadata: { type: "preference" },
    });

    expect(byteSize).toBeGreaterThan("I prefer dark mode".length);
    expect(byteSize).toBeGreaterThan(32);
  });

  test("tokenizes keywords for retrieval", () => {
    expect(
      tokenizeForKeywordSearch("My startup is Kontinue AI and I study statistics"),
    ).toEqual(
      expect.arrayContaining(["startup", "kontinue", "study", "statistics"]),
    );
  });

  test("scores retrieval using the documented weighting formula", () => {
    expect(
      computeMemoryRetrievalScore({
        vectorSimilarity: 0.8,
        importanceScore: 0.6,
        recencyScore: 0.5,
      }),
    ).toBeCloseTo(0.68);
  });
});
