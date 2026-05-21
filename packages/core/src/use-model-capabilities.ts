"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deriveCapabilities,
  fetchAiGatewayModels,
  type ModelCapability,
} from "./model-capabilities";
import { isProModel } from "./model-pricing";

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
      getCapabilities: (modelId: string) => capabilitiesById[modelId] ?? [],
      isProModel: (modelId: string) => proModelById[modelId] ?? true,
      capabilitiesById,
      proModelById,
    }),
    [capabilitiesById, proModelById]
  );
}
