import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { getDefaultModelForPlan, getModelById } from "@repo/ai/lib/models";

import { useIsProPlan } from "@/hooks/use-plan-tier";

/**
 * Selected chat model: local choice wins, then the Convex-persisted default,
 * then the plan-appropriate fallback (mirrors useHomePageActions on web).
 */
export function useSelectedModel() {
  const isPaidPlan = useIsProPlan();
  const persistedDefaultModel = useQuery(api.users.getDefaultModel, {});
  const saveDefaultModel = useMutation(api.users.setDefaultModel);
  const [localSelectedModel, setLocalSelectedModel] = useState<string | null>(null);

  const validatedPersistedModel =
    persistedDefaultModel && getModelById(persistedDefaultModel)
      ? persistedDefaultModel
      : null;

  const selectedModel =
    localSelectedModel ??
    validatedPersistedModel ??
    getDefaultModelForPlan(isPaidPlan).id;

  const setSelectedModel = useCallback(
    (modelId: string) => {
      if (!getModelById(modelId)) return;
      setLocalSelectedModel(modelId);
      void saveDefaultModel({ modelId }).catch((error) => {
        console.warn("Failed to persist selected model:", error);
      });
    },
    [saveDefaultModel],
  );

  return { selectedModel, setSelectedModel, isPaidPlan };
}
