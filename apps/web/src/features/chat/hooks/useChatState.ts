import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { Id } from "@repo/convex/convex/_generated/dataModel";
import { useIsProPlan } from "../../../lib/use-plan-tier";
import {
  AVAILABLE_MODELS,
  getDefaultModelForPlan,
  getModelById,
} from "@repo/ai/models";
import {
  readCachedDefaultModel,
  writeCachedDefaultModel,
} from "@repo/core/default-model-storage";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { consumePendingChatDraft } from "@repo/core/pending-chat-draft";

export function useChatState({ chatId }: { chatId: Id<"chats"> }) {
  const isPaidPlan = useIsProPlan();
  const { isProModel } = useModelCapabilities();
  const persistedDefaultModel = useQuery(api.users.getDefaultModel, {});
  const saveDefaultModel = useMutation(api.users.setDefaultModel);

  const [localSelectedModel, setLocalSelectedModel] = useState<string | null>(
    null,
  );
  const [cachedSelectedModel, setCachedSelectedModel] = useState<string | null>(
    () => readCachedDefaultModel(),
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<string>("auto");
  const [imageSize, setImageSize] = useState<string | null>(null);

  const hasConsumedPendingDraftRef = useRef(false);
  const validatedPersistedModel =
    persistedDefaultModel && getModelById(persistedDefaultModel)
      ? persistedDefaultModel
      : null;

  useEffect(() => {
    if (!validatedPersistedModel) return;
    setCachedSelectedModel(validatedPersistedModel);
    writeCachedDefaultModel(validatedPersistedModel);
  }, [validatedPersistedModel]);

  const setUserSelectedModel = useCallback(
    (modelId: string | null) => {
      setLocalSelectedModel(modelId);
      setCachedSelectedModel(modelId);
      writeCachedDefaultModel(modelId);
      if (!modelId || !getModelById(modelId)) return;

      void saveDefaultModel({ modelId }).catch((error) => {
        console.error("Failed to persist selected model:", error);
      });
    },
    [saveDefaultModel],
  );

  const selectedModel = useMemo(
    () =>
      localSelectedModel ??
      validatedPersistedModel ??
      cachedSelectedModel ??
      getDefaultModelForPlan(isPaidPlan).id,
    [localSelectedModel, validatedPersistedModel, cachedSelectedModel, isPaidPlan],
  );

  const modelOptionsByProvider = useMemo(() => {
    return AVAILABLE_MODELS.reduce<Record<string, typeof AVAILABLE_MODELS>>(
      (acc, model) => {
        const list = (acc[model.provider] ??= []);
        list.push(model);
        return acc;
      },
      {},
    );
  }, []);

  const modelOptionsWithAccess = useMemo(() => {
    const next: Record<
      string,
      Array<{ id: string; name: string; provider: string; disabled?: boolean }>
    > = {};

    for (const [provider, models] of Object.entries(modelOptionsByProvider)) {
      next[provider] = models.map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        disabled: !isPaidPlan && isProModel(model.id),
      }));
    }

    return next;
  }, [isPaidPlan, isProModel, modelOptionsByProvider]);

  const consumeDraft = (onSend: (text: string) => void) => {
    if (hasConsumedPendingDraftRef.current) return;
    hasConsumedPendingDraftRef.current = true;

    const draft = consumePendingChatDraft(String(chatId));
    if (!draft?.text?.trim()) return;

    if (draft.model && getModelById(draft.model)) {
      setUserSelectedModel(draft.model);
    }
    if (typeof draft.webSearchEnabled === "boolean") {
      setWebSearchEnabled(isPaidPlan ? draft.webSearchEnabled : false);
    }
    if (draft.imageAspectRatio) {
      setImageAspectRatio(draft.imageAspectRatio);
    }
    if ("imageSize" in draft) {
      setImageSize(draft.imageSize ?? null);
    }

    onSend(draft.text);
  };

  return {
    selectedModel,
    userSelectedModel:
      localSelectedModel ?? validatedPersistedModel ?? cachedSelectedModel,
    setUserSelectedModel,
    webSearchEnabled: isPaidPlan ? webSearchEnabled : false,
    setWebSearchEnabled,
    imageAspectRatio,
    setImageAspectRatio,
    imageSize,
    setImageSize,
    modelOptionsWithAccess,
    consumeDraft,
  };
}
