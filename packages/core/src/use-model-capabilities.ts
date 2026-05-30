"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deriveCapabilities,
  fetchAiGatewayModels,
  type ModelCapability,
} from "./model-capabilities";
import { isProModel } from "./model-pricing";

// Kept in sync with @repo/ai/lib/kai (avoids a core→ai package dependency).
const K_AI_MODEL_ID = "kontinue/k-ai-1.0";

export function useModelCapabilities() {
  const [capabilitiesById, setCapabilitiesById] = useState<
    Record<string, ModelCapability[]>
  >({});
  const [proModelById, setProModelById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const models = await fetchAiGatewayModels();
        if (cancelled) return;

        const next: Record<string, ModelCapability[]> = {};
        const nextProModels: Record<string, boolean> = {};
        for (const m of models) {
          next[m.id] = deriveCapabilities(m);
          nextProModels[m.id] = isProModel(m);
        }
        setCapabilitiesById(next);
        setProModelById(nextProModels);
      } catch {
        if (cancelled) return;
        setCapabilitiesById({});
        setProModelById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      getCapabilities: (modelId: string) => {
        // K-AI is not a gateway model. Its underlying open-source models
        // (Gemma, GPT-OSS) support reasoning, tool calling and web search, so
        // advertise the full capability set.
        if (modelId === K_AI_MODEL_ID) {
          // Gemma / GPT-OSS support reasoning and tool calling (tool calling is
          // not a displayed capability — it's wired in the chat route). Web
          // search is intentionally omitted: it relies on the Vercel-gateway
          // Perplexity tool, which is incompatible with OpenRouter routing.
          return ["text", "thinking"] as ModelCapability[];
        }
        return capabilitiesById[modelId] ?? [];
      },
      // K-AI is free for everyone — never gate it as a premium/pro model.
      isProModel: (modelId: string) =>
        modelId === K_AI_MODEL_ID ? false : (proModelById[modelId] ?? true),
      capabilitiesById,
      proModelById,
    }),
    [capabilitiesById, proModelById]
  );
}
