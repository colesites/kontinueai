import { gateway } from "@ai-sdk/gateway";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getAgent } from "@repo/ai/lib/agents";
import {
	isKaiModel,
	K_AI_MODEL_CHAIN,
	K_AI_PRIMARY_MODEL,
} from "@repo/ai/lib/kai";
import {
	isKodeModel,
	KODE_MODEL_CHAIN,
	KODE_PRIMARY_MODEL,
} from "@repo/ai/lib/kode";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { getModelAccessClass } from "@repo/core/model-pricing";
import { canAccessModel, canAccessPlanFeature } from "@repo/core/plan-access";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { convertToModelMessages, type LanguageModel, streamText } from "ai";
import { fetchAction, fetchMutation } from "convex/nextjs";
import { PLAN_ERROR_CODES, planDeniedResponse } from "../lib/plan-denial";
import { classifyChatError } from "./lib/error-classifier";
import { getGatewayRuntimeConfig } from "./lib/gateway-runtime";
import { getAiGatewayModelsCached } from "./lib/model-utils";
import { getTokenLimitsByTier, getUserPlanTier } from "./lib/plan-limits";
import {
	createInputTooLongResponse,
	estimateUiMessageTokens,
	getLastUserContent,
	hasUserFileAttachments,
	logDetailedError,
} from "./lib/request-utils";
import { getAuthContext, parseChatRouteInput } from "./lib/route-input";
import { logFinalStreamOptions } from "./lib/stream-logging";
import { buildStreamOptions, resolveToolRuntime } from "./lib/stream-runtime";
import { buildToolsAndPrompt } from "./lib/tools-config";
import type { AiGatewayModel } from "./lib/types";
import { detectSearchIntent } from "./lib/web-search/intent";
import { runKaiWebSearch } from "./lib/web-search/pipeline";

export const maxDuration = 60;

export async function POST(req: Request) {
	try {
		const { userId, hasPlan, getToken } = await getAuthContext();
		if (!userId) {
			// A genuine auth miss: Clerk's middleware didn't resolve a session for
			// this request. If this fires while the user IS signed in, the proxy
			// middleware isn't propagating auth context (see src/proxy.ts).
			console.warn("[chat-auth] 401 — auth() returned no userId on /api/chat");
			return new Response("Unauthorized", { status: 401 });
		}

		const {
			chatId,
			messages,
			modelId,
			webSearchEnabled: requestedWebSearchEnabled,
			imageAspectRatio,
			imageSize,
			userTimezone,
			agentId,
		} = await parseChatRouteInput(req);

		const lastUserContent = getLastUserContent(messages);
		console.log("[chat-debug] model string", modelId);

		// K-AI 1.0 is Kontinue's own orchestration layer — it does not live in the
		// AI Gateway catalog and is routed to OpenRouter (with failover) below. We
		// synthesize a language-model descriptor so the rest of the pipeline (tool
		// attachment, prompt building) works unchanged.
		const usingKai = isKaiModel(modelId);
		// Kode 1.0 is the Kode IDE's coding model and is NOT offered in the web model
		// picker — its real home is the IDE (Tauri). Like K-AI it lives outside the AI
		// Gateway catalog and routes to OpenRouter via KODE_PRIMARY_MODEL/KODE_MODEL_CHAIN.
		const usingKode = isKodeModel(modelId);
		// Both branded layers share the same OpenRouter path; pick the right chain.
		const usingOpenRouter = usingKai || usingKode;
		const openRouterPrimary = usingKode
			? KODE_PRIMARY_MODEL
			: K_AI_PRIMARY_MODEL;
		const openRouterChain = usingKode ? KODE_MODEL_CHAIN : K_AI_MODEL_CHAIN;

		let requestedModel: AiGatewayModel;
		if (usingOpenRouter) {
			requestedModel = { id: modelId, type: "language", tags: [] };
		} else {
			const models = await getAiGatewayModelsCached();
			const found = models.find((model) => model.id === modelId);
			if (!found) {
				return new Response("Unknown model", { status: 400 });
			}
			requestedModel = found;
		}

		const planTier = await getUserPlanTier(userId, hasPlan);
		if (usingKode && !canAccessPlanFeature(planTier, "kode")) {
			return planDeniedResponse(
				PLAN_ERROR_CODES.PREMIUM_MODEL_REQUIRED,
				"Kode is available on Pro and Max.",
			);
		}
		// K-AI routes through OpenRouter, which can't use the Vercel-gateway
		// Perplexity web-search tool, so web search is disabled for it.
		let webSearchEnabled =
			!usingOpenRouter &&
			canAccessPlanFeature(planTier, "premium-model") &&
			requestedWebSearchEnabled;
		if (
			!canAccessPlanFeature(planTier, "file-upload") &&
			hasUserFileAttachments(messages)
		) {
			return planDeniedResponse(
				PLAN_ERROR_CODES.FILE_UPLOAD_REQUIRED,
				"File attachments are available on Starter, Plus, Pro, and Max.",
			);
		}

		const modelClass = usingKai
			? "kai"
			: usingKode
				? "frontier"
				: getModelAccessClass(requestedModel);
		if (
			modelClass !== "kai" &&
			!canAccessModel(planTier, requestedModel.id, modelClass)
		) {
			return planDeniedResponse(
				PLAN_ERROR_CODES.PREMIUM_MODEL_REQUIRED,
				`The ${modelClass} model group is not included in the ${planTier} plan.`,
			);
		}

		const tokenLimits = getTokenLimitsByTier({
			planTier,
			modelClass,
		});
		const maxOutputTokens = tokenLimits.maxOutputTokens;
		const estimatedInputTokens = estimateUiMessageTokens(messages);
		if (estimatedInputTokens > tokenLimits.maxInputTokens) {
			return createInputTooLongResponse({
				tierLabel: tokenLimits.tierLabel,
				maxInputTokens: tokenLimits.maxInputTokens,
				estimatedInputTokens,
			});
		}

		const gatewayRuntime = getGatewayRuntimeConfig();
		const openRouterKey = process.env.OPEN_ROUTER ?? null;
		if (usingOpenRouter) {
			if (!openRouterKey) {
				console.error(
					"Chat API misconfigured: missing OPEN_ROUTER key for K-AI/Kode.",
				);
				return new Response("AI is not configured. Please try again later.", {
					status: 500,
				});
			}
		} else if (!gatewayRuntime) {
			return new Response("AI is not configured. Please try again later.", {
				status: 500,
			});
		}

		// Resolve the Convex auth token once; reused for memory context fetch and
		// any authed tool calls (e.g. create_task) below.
		const convexToken = (await getToken?.({ template: "convex" })) ?? null;
		if (!convexToken) {
			return new Response(
				"Your account could not be verified. Please try again.",
				{
					status: 503,
				},
			);
		}
		try {
			await fetchMutation(
				convexApi.messages.consumeChatRequest,
				{
					model: modelId,
					...(modelClass === "kai" ? {} : { modelClass }),
				},
				{ token: convexToken },
			);
		} catch (error) {
			const data =
				typeof error === "object" && error !== null && "data" in error
					? (error as { data?: { message?: string; code?: string } }).data
					: undefined;
			const message =
				data?.message ??
				(error instanceof Error ? error.message : "Plan usage limit reached.");
			return new Response(message, {
				status: 429,
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					...(data?.code ? { "x-error-code": data.code } : {}),
				},
			});
		}
		if (webSearchEnabled && convexToken) {
			const searchQuota = await fetchMutation(
				convexApi.webSearch.consumeSearchQuota,
				{},
				{ token: convexToken },
			);
			webSearchEnabled = searchQuota.allowed;
		}

		let memoryContextText: string | null = null;
		if (chatId && lastUserContent.trim() && convexToken) {
			try {
				const memoryContext = await fetchAction(
					convexApi.memoryWorkers.getChatMemoryContext,
					{
						chatId: chatId as Id<"chats">,
						userMessage: lastUserContent,
					},
					{ token: convexToken },
				);
				memoryContextText = memoryContext?.contextText ?? null;
			} catch (error) {
				logDetailedError("Memory context fetch failed", error);
			}
		}

		// K-AI web search: a dedicated retrieval pipeline (NOT a model tool). We
		// decide whether the query needs live data, run the search/extract/cache
		// pipeline, and inject the cleaned results into the prompt with citations.
		let webSearchContextText: string | null = null;
		if (usingKai && convexToken && lastUserContent.trim()) {
			// Research/Marketing agents bias toward live data (aggressive intent).
			const activeAgent = getAgent(agentId ?? null);
			const intent = detectSearchIntent(lastUserContent, {
				aggressive: activeAgent?.autoWebSearch ?? false,
			});
			// The manual Web Search toggle forces a search regardless of intent. For
			// K-AI it's allowed on every tier (still bounded by the daily quota).
			const forceSearch = requestedWebSearchEnabled === true;
			console.log("[web-search] intent", {
				shouldSearch: intent.shouldSearch,
				confidence: intent.confidence.toFixed(2),
				reason: intent.reason,
				forced: forceSearch,
			});
			if (intent.shouldSearch || forceSearch) {
				try {
					const result = await runKaiWebSearch({
						query: lastUserContent,
						convexToken,
					});
					if (result && "limited" in result && result.limited) {
						// Daily free-tier budget exhausted — answer model-only and say so.
						webSearchContextText =
							"NOTE: The user's daily web-search limit has been reached, so live web results are unavailable for this message. Answer from your existing knowledge and tell the user their daily web-search limit was reached (it resets tomorrow, or they can upgrade).";
					} else if (result && !("limited" in result)) {
						webSearchContextText = result.contextText;
					}
				} catch (error) {
					logDetailedError("Web search failed", error);
				}
			}
		}

		// Build the language model. K-AI routes through OpenRouter, handing it the
		// ordered model chain (primary + fallbacks) so OpenRouter automatically
		// fails over on rate limits, provider downtime, or model errors — all
		// transparent to the user, who only ever sees "K-AI 1.0".
		let modelInstance: LanguageModel;
		if (usingOpenRouter) {
			if (!openRouterKey) {
				throw new Error("OPEN_ROUTER must be configured for K-AI and Kode.");
			}
			const openrouter = createOpenRouter({ apiKey: openRouterKey });
			modelInstance = openrouter.chat(openRouterPrimary, {
				// OpenRouter tries this ordered list and auto-fails-over on rate limit,
				// provider downtime, or model error — transparent to the user.
				models: openRouterChain,
			}) as unknown as LanguageModel;
		} else {
			modelInstance = gateway(modelId) as unknown as LanguageModel;
		}

		// K-AI never uses the gateway Perplexity tool (incompatible with OpenRouter);
		// its web search runs through our own pipeline above. So force the tool-side
		// web-search flag off for K-AI even when the toggle is on.
		const toolWebSearchEnabled = usingOpenRouter ? false : webSearchEnabled;

		const toolsConfig = buildToolsAndPrompt({
			requestedModel,
			modelId,
			webSearchEnabled: toolWebSearchEnabled,
			lastUserContent,
			maxOutputTokens,
			imageAspectRatio,
			imageSize,
			apiKey: gatewayRuntime?.apiKey ?? "",
			gatewayOpenAIBaseUrl: gatewayRuntime?.gatewayOpenAIBaseUrl ?? "",
			userTimezone,
			memoryContextText,
			webSearchContextText,
			convexToken,
			chatId: chatId ? (chatId as Id<"chats">) : null,
			agentId,
			enableKaiImageGeneration:
				usingKai && PLAN_DEFINITIONS[planTier].imageGenerations > 0,
			openRouterKey,
		});

		const toolRuntime = resolveToolRuntime({
			modelId,
			webSearchEnabled: toolWebSearchEnabled,
			supportsTools: toolsConfig.supportsTools,
			hasImageGen: toolsConfig.hasImageGen,
			provider: toolsConfig.provider,
			shouldAttachWebSearchTool: toolsConfig.shouldAttachWebSearchTool,
			tools: toolsConfig.tools,
			maxOutputTokens,
		});

		const modelMessages = await convertToModelMessages(messages);
		const streamOptions = buildStreamOptions({
			model: modelInstance,
			systemPrompt: toolsConfig.systemPrompt,
			modelMessages,
			maxOutputTokens,
			tools: toolsConfig.tools,
			shouldDisableTools: toolRuntime.shouldDisableTools,
			hasTools: toolRuntime.hasTools,
			forceImageTool: toolsConfig.forceImageTool,
			forceWebSearchTool: toolsConfig.forceWebSearchTool,
			stopWhen: toolRuntime.stopWhen,
		});

		logFinalStreamOptions({
			modelId,
			planTier,
			requestedToolNames: toolRuntime.requestedToolNames,
			appliedToolNames:
				streamOptions.tools && typeof streamOptions.tools === "object"
					? Object.keys(streamOptions.tools)
					: [],
			webSearchEnabled,
			hasWebSearchCapability: toolsConfig.hasWebSearch,
			supportsTools: toolsConfig.supportsTools,
			imageAspectRatio,
			imageSize,
			openaiImageToolSize: toolsConfig.openaiImageToolSize,
			forceWebSearchTool: toolsConfig.forceWebSearchTool,
			forceImageTool: !!toolsConfig.forceImageTool,
			stopWhenCount: toolRuntime.stopWhen.length,
			maxSteps: toolRuntime.maxSteps,
			systemPrompt: toolsConfig.systemPrompt,
			messageCount: modelMessages.length,
		});

		return streamText(streamOptions).toUIMessageStreamResponse({
			onError: (error) => {
				logDetailedError("UI message stream error", error);
				// Map the real (logged) cause to a stable, user-safe message the client
				// turns into a friendly toast. Real details stay in the server logs.
				return classifyChatError(error);
			},
		});
	} catch (error) {
		logDetailedError("Chat API error", error);
		return new Response(classifyChatError(error), { status: 500 });
	}
}
