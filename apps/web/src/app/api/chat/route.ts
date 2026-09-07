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
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { PLAN_ERROR_CODES, planDeniedResponse } from "../lib/plan-denial";
import { isCodeSandboxConfigured } from "./lib/code-sandbox";
import { classifyChatError } from "./lib/error-classifier";
import { getGatewayRuntimeConfig } from "./lib/gateway-runtime";
import { getAiGatewayModelsCached } from "./lib/model-utils";
import { getTokenLimitsByTier, getUserPlanTier } from "./lib/plan-limits";
import {
	createInputTooLongResponse,
	estimateUiMessageTokens,
	getLastUserContent,
	hasUserFileAttachments,
	limitMessagesToInputTokens,
	logDetailedError,
} from "./lib/request-utils";
import { getAuthContext, parseChatRouteInput } from "./lib/route-input";
import { logFinalStreamOptions } from "./lib/stream-logging";
import { buildStreamOptions, resolveToolRuntime } from "./lib/stream-runtime";
import { buildToolsAndPrompt } from "./lib/tools-config";
import type { AiGatewayModel } from "./lib/types";
import { runKaiWebSearch } from "./lib/web-search/pipeline";
import {
	resolveWebSearchPolicy,
	shouldRunRetrievalPipeline,
	type WebSearchPolicy,
} from "./lib/web-search/policy";

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
		// Web search is decided per turn, not switched on and off. The toggle
		// forces a search; with it off we still search when the question needs
		// live data. Either way the search is charged against the same monthly
		// quota — see lib/web-search/policy.ts.
		//
		// K-AI routes through OpenRouter, which can't use the Vercel-gateway
		// Perplexity tool, so it searches through our own pipeline instead
		// (`runKaiWebSearch`); Kode has no search path at all.
		const activeAgent = getAgent(agentId ?? null);
		const webSearchPolicy: WebSearchPolicy = resolveWebSearchPolicy({
			toggleOn: requestedWebSearchEnabled,
			// K-AI's search is included on every tier (bounded by the monthly
			// quota); the gateway models' Perplexity search is paid-only.
			planAllowsSearch:
				usingKai || canAccessPlanFeature(planTier, "premium-model"),
			surfaceSupportsSearch: usingKai || !usingOpenRouter,
			lastUserContent,
			// Research/Marketing agents bias toward live data.
			aggressive: activeAgent?.autoWebSearch ?? false,
		});
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
		// A plan's context allowance applies to one model request, not to how much
		// conversation a person may keep. Imported chats can therefore remain whole
		// while each new response receives the newest fitting run of messages.
		const messagesForModel = limitMessagesToInputTokens(
			messages,
			tokenLimits.maxInputTokens,
		);
		if (
			!canAccessPlanFeature(planTier, "file-upload") &&
			hasUserFileAttachments(messagesForModel)
		) {
			return planDeniedResponse(
				PLAN_ERROR_CODES.FILE_UPLOAD_REQUIRED,
				"File attachments are available on Starter, Plus, Pro, and Max.",
			);
		}
		const estimatedInputTokens = estimateUiMessageTokens(messagesForModel);
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
		// Two independent lookups before the model runs: the memory context for
		// this message, and a quota probe for web search. Run them together so
		// auto mode costs no extra latency over the old on/off gate.
		//
		// The probe deliberately does NOT spend anything. A search is charged when
		// one actually runs — the K-AI pipeline charges on a real provider hit, the
		// gateway tool from onStepFinish below — so a turn where the model decides
		// not to search costs the user nothing, and a turn where it decides on its
		// own to search is charged exactly like a toggled one.
		const [memoryContextText, searchQuotaExhausted] = await Promise.all([
			(async (): Promise<string | null> => {
				if (!chatId || !lastUserContent.trim()) return null;
				try {
					const memoryContext = await fetchAction(
						convexApi.memoryWorkers.getChatMemoryContext,
						{
							chatId: chatId as Id<"chats">,
							userMessage: lastUserContent,
						},
						{ token: convexToken },
					);
					return memoryContext?.contextText ?? null;
				} catch (error) {
					logDetailedError("Memory context fetch failed", error);
					return null;
				}
			})(),
			(async (): Promise<boolean> => {
				if (webSearchPolicy.mode === "off") return false;
				try {
					const quota = await fetchQuery(
						convexApi.webSearch.checkSearchQuota,
						{},
						{ token: convexToken },
					);
					console.log("[web-search] quota probe", {
						used: quota.used,
						limit: quota.limit,
						reason: quota.reason,
					});
					return !quota.allowed;
				} catch (error) {
					logDetailedError("Web search quota probe failed", error);
					return false;
				}
			})(),
		]);
		// The search we would run this turn, after plan + quota.
		const webSearchActive =
			webSearchPolicy.mode !== "off" && !searchQuotaExhausted;
		console.log("[web-search] policy", {
			mode: webSearchPolicy.mode,
			trigger: webSearchPolicy.trigger,
			intentLikely: webSearchPolicy.intentLikely,
			confidence: webSearchPolicy.confidence.toFixed(2),
			reason: webSearchPolicy.reason,
			active: webSearchActive,
		});

		// K-AI web search: a dedicated retrieval pipeline (NOT a model tool). K-AI
		// runs on a free Gemma tier whose provider 500s far more often once tools
		// are attached, so the decision stays server-side: the policy above already
		// chose, from the toggle or the intent heuristic, whether this turn
		// searches. Results are injected into the prompt with citations.
		let webSearchContextText: string | null = null;
		if (
			usingKai &&
			lastUserContent.trim() &&
			shouldRunRetrievalPipeline(webSearchPolicy)
		) {
			if (searchQuotaExhausted) {
				// Only say so when the user actually asked for a search. An auto
				// search they never requested should degrade quietly to a model-only
				// answer, not turn into an upsell.
				webSearchContextText =
					webSearchPolicy.trigger === "manual"
						? "NOTE: The user turned on Web Search but their monthly web-search limit has been reached, so live web results are unavailable for this message. Answer from your existing knowledge and tell them their web-search limit was reached (it resets next month, or they can upgrade)."
						: null;
			} else {
				try {
					const result = await runKaiWebSearch({
						query: lastUserContent,
						convexToken,
						trigger: webSearchPolicy.trigger,
					});
					if (result && "limited" in result && result.limited) {
						// Budget ran out between the probe and the search.
						webSearchContextText =
							webSearchPolicy.trigger !== "manual"
								? null
								: result.reason === "credits_exhausted"
									? "NOTE: The user turned on Web Search but their AI usage credits are exhausted, so live web results are unavailable for this message. Answer from your existing knowledge and tell them their credits ran out for this month."
									: "NOTE: The user turned on Web Search but their monthly web-search limit has been reached, so live web results are unavailable for this message. Answer from your existing knowledge and tell them their web-search limit was reached (it resets next month, or they can upgrade).";
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
		// its web search runs through our own pipeline above. So the tool-side mode
		// is always off for K-AI, however the toggle is set.
		//
		// For gateway models the mode is what the model is told: "forced" means
		// search this turn, "auto" means the tool is there and it should reach for
		// it when the question needs live data.
		const toolWebSearchMode =
			usingOpenRouter || !webSearchActive ? "off" : webSearchPolicy.mode;
		const toolWebSearchEnabled = toolWebSearchMode !== "off";
		// A forced search we couldn't run is worth saying out loud; an auto search
		// the user never asked for is not.
		const webSearchLimitReached =
			searchQuotaExhausted && webSearchPolicy.trigger === "manual";

		const toolsConfig = buildToolsAndPrompt({
			requestedModel,
			modelId,
			webSearchMode: toolWebSearchMode,
			webSearchLimitReached,
			// In auto mode the model chooses; a positive intent read only makes the
			// prompt lean harder toward searching.
			webSearchIntentLikely: webSearchPolicy.intentLikely,
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
			// File creation via sandboxed Python. Needs both the plan and a runtime
			// that can actually start a sandbox (VERCEL_* creds locally, OIDC on
			// Vercel) — without the latter the tool would only ever fail.
			enableCodeExecution:
				canAccessPlanFeature(planTier, "code-execution") &&
				isCodeSandboxConfigured(),
			userId,
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

		const modelMessages = await convertToModelMessages(messagesForModel);
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
			// The gateway runs perplexity_search on its own; we only learn a search
			// happened from the step that called it. Charge it here so an
			// auto-triggered search counts exactly like a toggled one, and so a turn
			// where the model never searched costs nothing.
			onWebSearchToolCall: toolWebSearchEnabled
				? (callCount) => {
						// One message costs at most one web search, matching how the
						// K-AI pipeline bills and how the plan's "web searches per
						// month" reads. Extra calls inside the same turn are logged,
						// not charged again.
						if (callCount > 1) {
							console.log("[web-search] extra gateway search in same turn", {
								callCount,
							});
							return;
						}
						void fetchMutation(
							convexApi.webSearch.consumeSearchQuota,
							{ source: webSearchPolicy.trigger },
							{ token: convexToken },
						)
							.then((quota) => {
								console.log("[web-search] gateway search charged", {
									trigger: webSearchPolicy.trigger,
									callCount,
									allowed: quota.allowed,
									reason: quota.reason,
									remaining: quota.remaining,
								});
							})
							.catch((error) => {
								logDetailedError("Web search quota consume failed", error);
							});
					}
				: undefined,
		});

		logFinalStreamOptions({
			modelId,
			planTier,
			requestedToolNames: toolRuntime.requestedToolNames,
			appliedToolNames:
				streamOptions.tools && typeof streamOptions.tools === "object"
					? Object.keys(streamOptions.tools)
					: [],
			webSearchEnabled: toolWebSearchEnabled,
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
