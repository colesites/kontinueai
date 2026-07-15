import { isKaiModel } from "@repo/ai/lib/kai";
import {
	AVAILABLE_MODELS,
	getDefaultModelForPlan,
	getModelById,
} from "@repo/ai/models";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
	readCachedDefaultModel,
	writeCachedDefaultModel,
} from "@repo/core/default-model-storage";
import { consumePendingChatDraft } from "@repo/core/pending-chat-draft";
import { canAccessModel } from "@repo/core/plan-access";
import { isPlanAtLeast } from "@repo/core/plan-tier";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanTier } from "../../../lib/use-plan-tier";

export function useChatState({ chatId }: { chatId: Id<"chats"> }) {
	const planTier = usePlanTier();
	const { getModelAccessClass } = useModelCapabilities();
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
			getDefaultModelForPlan(isPlanAtLeast(planTier, "pro")).id,
		[
			localSelectedModel,
			validatedPersistedModel,
			cachedSelectedModel,
			planTier,
		],
	);

	const modelOptionsByProvider = useMemo(() => {
		return AVAILABLE_MODELS.reduce<Record<string, typeof AVAILABLE_MODELS>>(
			(acc, model) => {
				const list = acc[model.provider] ?? [];
				list.push(model);
				acc[model.provider] = list;
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
				disabled:
					!isKaiModel(model.id) &&
					!canAccessModel(planTier, model.id, getModelAccessClass(model.id)),
			}));
		}

		return next;
	}, [getModelAccessClass, modelOptionsByProvider, planTier]);

	const consumeDraft = (onSend: (text: string) => void) => {
		if (hasConsumedPendingDraftRef.current) return;
		hasConsumedPendingDraftRef.current = true;

		const draft = consumePendingChatDraft(String(chatId));
		if (!draft?.text?.trim()) return;

		if (draft.model && getModelById(draft.model)) {
			setUserSelectedModel(draft.model);
		}
		if (typeof draft.webSearchEnabled === "boolean") {
			const allowSearch =
				isPlanAtLeast(planTier, "plus") ||
				isKaiModel(draft.model ?? selectedModel);
			setWebSearchEnabled(allowSearch ? draft.webSearchEnabled : false);
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
		// K-AI's web search is free for all tiers (its own daily quota); only the
		// gateway models' search is paid-gated.
		webSearchEnabled:
			isPlanAtLeast(planTier, "plus") || isKaiModel(selectedModel)
				? webSearchEnabled
				: false,
		setWebSearchEnabled,
		imageAspectRatio,
		setImageAspectRatio,
		imageSize,
		setImageSize,
		modelOptionsWithAccess,
		consumeDraft,
	};
}
