import { isKaiModel, K_AI_MODEL_CHAIN } from "@repo/ai/lib/kai";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { getModelAccessClass } from "@repo/core/model-pricing";
import { canAccessModel } from "@repo/core/plan-access";
import { fetchMutation } from "convex/nextjs";
import { getAiGatewayModelsCached } from "../../chat/lib/model-utils";
import { getTokenLimitsByTier, getUserPlanTier } from "../../chat/lib/plan-limits";
import { getAuthContext } from "../../chat/lib/route-input";
import { jsonError, proxyGatewayChat } from "../../kode/lib/gateway-stream";

// Model proxy for the desktop app's Home chat.
//
// Same rules as the web chat (/api/chat): model access by plan, the monthly
// request quota (messages.consumeChatRequest) and per-plan input/output caps.
// The desktop sends an OpenAI-style request with `kontinue: { modelId }`; the
// reply streams back unchanged. The gateway key stays on the server.

export const maxDuration = 300;

type DesktopChatBody = Record<string, unknown> & {
	kontinue?: { modelId?: string };
	max_tokens?: number;
};

export async function POST(request: Request) {
	const { userId, hasPlan, getToken } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to chat.");

	const convexToken = (await getToken?.({ template: "convex" })) ?? undefined;
	if (!convexToken) return jsonError(401, "unauthorized", "Your session expired. Sign in again.");

	let body: DesktopChatBody;
	try {
		body = (await request.json()) as DesktopChatBody;
	} catch {
		return jsonError(400, "bad_request", "Invalid request body.");
	}

	const modelId = body.kontinue?.modelId ?? (typeof body.model === "string" ? body.model : "");
	const usingKai = isKaiModel(modelId);

	let modelClass: "kai" | ReturnType<typeof getModelAccessClass> = "kai";
	let supportsReasoning = true;
	if (!usingKai) {
		const models = await getAiGatewayModelsCached();
		const found = models.find((model) => model.id === modelId);
		if (!found) return jsonError(400, "unknown_model", "Unknown model.");
		modelClass = getModelAccessClass(found);
		supportsReasoning = Array.isArray(found.tags) && found.tags.includes("reasoning");
	}

	const planTier = await getUserPlanTier(userId, hasPlan);
	if (modelClass !== "kai" && !canAccessModel(planTier, modelId, modelClass)) {
		return jsonError(403, "plan_required", "This model isn't included in your plan. Upgrade to use it.");
	}

	const limits = getTokenLimitsByTier({ planTier, modelClass });
	// Rough input size check (≈4 characters per token), like the web chat.
	const estimatedInput = Math.ceil(JSON.stringify(body.messages ?? []).length / 4);
	if (estimatedInput > limits.maxInputTokens) {
		return jsonError(
			413,
			"input_too_long",
			`This conversation is too long for the ${limits.tierLabel} limit. Start a new chat or upgrade for more context.`,
		);
	}

	try {
		await fetchMutation(
			convexApi.messages.consumeChatRequest,
			{ model: modelId, ...(modelClass === "kai" ? {} : { modelClass }) },
			{ token: convexToken },
		);
	} catch (error) {
		const data =
			typeof error === "object" && error !== null && "data" in error
				? (error as { data?: { message?: string } }).data
				: undefined;
		return jsonError(429, "limit", data?.message ?? "You've reached your plan's usage limit.");
	}

	const { kontinue: _kontinue, models: _clientModels, ...rest } = body;
	const upstreamBody: Record<string, unknown> = {
		...rest,
		model: usingKai ? K_AI_MODEL_CHAIN[0] : modelId,
		max_tokens: Math.min(
			typeof body.max_tokens === "number" ? body.max_tokens : limits.maxOutputTokens,
			limits.maxOutputTokens,
		),
	};
	if (usingKai) upstreamBody.models = K_AI_MODEL_CHAIN;
	// Only reasoning models get the reasoning setting.
	if (!supportsReasoning) delete upstreamBody.reasoning;

	// Home chat is billed per request (above), so usage isn't recorded here.
	return proxyGatewayChat({ body: upstreamBody, logTag: "desktop/chat", onUsage: async () => {} });
}
