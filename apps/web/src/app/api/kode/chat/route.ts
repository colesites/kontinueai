import {
	canUseFastMode,
	getKodeModelById,
	isKodeModel,
	KODE_EFFORTS,
	KODE_GATEWAY_CHAIN,
	kodeMaxOutputTokens,
	resolveKodeEffort,
	type KodeEffort,
} from "@repo/ai/lib/kode";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { getAuthContext } from "../../chat/lib/route-input";
import { jsonError, proxyGatewayChat } from "../lib/gateway-stream";

// Kode model proxy for the desktop app.
//
// The desktop builds an OpenAI-style chat completion request (system prompt,
// messages, tools) and sends it here with the user's Clerk session token and
// `kontinue: { modelId, fast }`. This route checks plan access + usage in
// Convex (kodeUsage.authorize), maps the Kontinue model id to its gateway id
// (fast variant when allowed), streams the reply back, and records the real
// cost (kodeUsage.record). The gateway key never leaves the server.

export const maxDuration = 300;

type KodeRequestBody = Record<string, unknown> & {
	kontinue?: { modelId?: string; fast?: boolean };
};

export async function POST(request: Request) {
	const { userId, getToken } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to use Kode.");

	const convexToken = (await getToken?.({ template: "convex" })) ?? undefined;
	if (!convexToken) return jsonError(401, "unauthorized", "Your session expired. Sign in again.");

	let body: KodeRequestBody;
	try {
		body = (await request.json()) as KodeRequestBody;
	} catch {
		return jsonError(400, "bad_request", "Invalid request body.");
	}

	const modelId = body.kontinue?.modelId ?? (typeof body.model === "string" ? body.model : "");
	const model = getKodeModelById(modelId);
	if (!model) return jsonError(400, "unknown_model", "Unknown Kode model.");

	const decision = await fetchQuery(convexApi.kodeUsage.authorize, { modelId }, { token: convexToken });
	if (!decision.allowed) {
		const status = decision.reason === "auth" ? 401 : decision.reason === "locked" ? 403 : 429;
		return jsonError(status, `kode_${decision.reason}`, decision.message, { resetAt: decision.resetAt });
	}

	const fast = !!body.kontinue?.fast && canUseFastMode(model, decision.plan);
	const { kontinue: _kontinue, models: _clientModels, ...rest } = body;
	const upstreamBody: Record<string, unknown> = {
		...rest,
		model: fast && model.fast ? model.fast.gatewayId : model.gatewayId,
	};
	// Reasoning: map the requested effort to one this model supports; only send
	// "off" where the provider allows disabling it.
	const reasoning = body.reasoning as { enabled?: boolean; effort?: string } | undefined;
	delete upstreamBody.reasoning;
	if (reasoning) {
		if (reasoning.enabled === false) {
			if (model.reasoning.canDisable) upstreamBody.reasoning = { enabled: false };
		} else {
			const requested = KODE_EFFORTS.includes(reasoning.effort as KodeEffort)
				? (reasoning.effort as KodeEffort)
				: "high";
			const effort = resolveKodeEffort(model, requested);
			upstreamBody.reasoning = effort ? { enabled: true, effort } : { enabled: true };
		}
	}
	// Kode 1.0 fails over across its gateway chain.
	if (isKodeModel(model.id) && !fast) upstreamBody.models = KODE_GATEWAY_CHAIN;
	// A real output budget, so long replies aren't cut at the provider default.
	const maxOutput = kodeMaxOutputTokens(String(upstreamBody.model));
	if (maxOutput && upstreamBody.max_tokens == null && upstreamBody.max_completion_tokens == null) {
		upstreamBody.max_tokens = maxOutput;
	}

	return proxyGatewayChat({
		body: upstreamBody,
		logTag: "kode/chat",
		onUsage: async (usage) => {
			const secret = process.env.KODE_SERVER_SECRET;
			if (!secret) throw new Error("KODE_SERVER_SECRET is not set");
			// Recorded with the server secret: the user's token can expire
			// during long replies.
			await fetchMutation(convexApi.kodeUsage.recordFromServer, {
					secret,
					clerkUserId: userId,
					modelId: model.id,
					fast,
					inputTokens: usage.prompt_tokens ?? 0,
					outputTokens: usage.completion_tokens ?? 0,
					cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
				});
		},
	});
}
