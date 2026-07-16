import {
	getKodeWebCreditCharge,
	getKodeWebMonthKey,
	getKodeWebNextResetAt,
	KODE_WEB_BUILD_CREDIT_RESERVATION,
	KODE_WEB_FILE_PATHS,
	KODE_WEB_MAX_FILE_BYTES,
	KODE_WEB_MAX_PROJECT_FILES,
	KODE_WEB_MODEL_ID,
	KODE_WEB_MONTHLY_CREDITS,
	KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { ConvexError, v } from "convex/values";
import { getPersistedPlanTier } from "../lib/plan";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import {
	consumeAiUsageCredits,
	refundAiUsageCredits,
} from "./lib/aiUsageCredits";

const ALLOWED_FILE_PATHS = new Set<string>(KODE_WEB_FILE_PATHS);

async function getUserOrNull(ctx: QueryCtx): Promise<Doc<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
}

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHORIZED",
			message: "Not authenticated.",
		});
	}

	const user = await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
	if (!user) {
		throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
	}
	return user;
}

function hasKode(user: Doc<"users">): boolean {
	const tier = getPersistedPlanTier(user.plan);
	return tier === "pro" || tier === "max";
}

function requireKode(user: Doc<"users">): void {
	if (!hasKode(user)) {
		throw new ConvexError({
			code: "PRO_REQUIRED",
			message: "Kode is available on Pro and Max.",
		});
	}
}

async function requireOwnedProject(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"kodeWebProjects">,
	ownerId: Id<"users">,
): Promise<Doc<"kodeWebProjects">> {
	const project = await ctx.db.get(projectId);
	if (!project || project.ownerId !== ownerId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: "Kode project not found.",
		});
	}
	return project;
}

function projectTitleFromPrompt(prompt: string): string {
	const cleaned = prompt
		.replace(
			/@(github|notion|vercel|gmail|google_calendar|google_drive|google_sheets|todoist)\b/gi,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return "Untitled Kode project";
	const title = cleaned.slice(0, 58).trim();
	return cleaned.length > title.length ? `${title}…` : title;
}

async function getCreditState(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	planTier: ReturnType<typeof getPersistedPlanTier>,
	now: number,
) {
	const monthKey = getKodeWebMonthKey(now);
	const row = await ctx.db
		.query("kodeWebCredits")
		.withIndex("by_owner_and_month", (q) =>
			q.eq("ownerId", ownerId).eq("monthKey", monthKey),
		)
		.unique();
	const used = row?.used ?? 0;
	const allowance = KODE_WEB_MONTHLY_CREDITS[planTier];
	return {
		row,
		monthKey,
		allowance,
		used,
		remaining: Math.max(0, allowance - used),
		resetAt: getKodeWebNextResetAt(now),
	};
}

async function getMonthlyBuildCount(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	limit: number,
	now: number,
): Promise<number> {
	if (limit <= 0) return 0;
	const date = new Date(now);
	const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
	const builds = await ctx.db
		.query("kodeWebBuilds")
		.withIndex("by_owner_mode_created", (q) =>
			q.eq("ownerId", ownerId).eq("mode", "build").gte("createdAt", monthStart),
		)
		.take(limit);
	return builds.length;
}

export const getCredits = query({
	args: {},
	handler: async (ctx) => {
		const user = await getUserOrNull(ctx);
		if (!user) return null;
		const tier = getPersistedPlanTier(user.plan);
		const isPro = hasKode(user);
		const now = Date.now();
		const [state, buildsUsed] = await Promise.all([
			getCreditState(ctx, user._id, tier, now),
			getMonthlyBuildCount(
				ctx,
				user._id,
				PLAN_DEFINITIONS[tier].kodeBuilds,
				now,
			),
		]);
		return {
			isPro,
			buildLimit: isPro ? PLAN_DEFINITIONS[tier].kodeBuilds : 0,
			buildsUsed: isPro ? buildsUsed : 0,
			allowance: isPro ? state.allowance : 0,
			used: isPro ? state.used : 0,
			remaining: isPro ? state.remaining : 0,
			resetAt: state.resetAt,
		};
	},
});

export const listProjects = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const user = await getUserOrNull(ctx);
		if (!user || !hasKode(user)) return [];
		const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 24)));
		return await ctx.db
			.query("kodeWebProjects")
			.withIndex("by_owner_and_updated", (q) => q.eq("ownerId", user._id))
			.order("desc")
			.take(limit);
	},
});

export const createProject = mutation({
	args: { prompt: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const prompt = args.prompt.trim();
		if (prompt.length < 3 || prompt.length > 8_000) {
			throw new ConvexError({
				code: "INVALID_PROMPT",
				message: "Describe the app in 3 to 8,000 characters.",
			});
		}
		const now = Date.now();
		return await ctx.db.insert("kodeWebProjects", {
			ownerId: user._id,
			title: projectTitleFromPrompt(prompt),
			description: prompt.slice(0, 240),
			status: "draft",
			activeVersion: 0,
			starred: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getWorkspace = query({
	args: { projectId: v.id("kodeWebProjects") },
	handler: async (ctx, args) => {
		const user = await getUserOrNull(ctx);
		if (!user || !hasKode(user)) return null;
		const project = await ctx.db.get(args.projectId);
		if (!project || project.ownerId !== user._id) return null;

		const [files, messages, builds, credits] = await Promise.all([
			project.activeVersion > 0
				? ctx.db
						.query("kodeWebFiles")
						.withIndex("by_project_and_version", (q) =>
							q
								.eq("projectId", project._id)
								.eq("version", project.activeVersion),
						)
						.take(KODE_WEB_MAX_PROJECT_FILES)
				: Promise.resolve([]),
			ctx.db
				.query("kodeWebMessages")
				.withIndex("by_project_and_order", (q) =>
					q.eq("projectId", project._id),
				)
				.take(100),
			ctx.db
				.query("kodeWebBuilds")
				.withIndex("by_project_and_created", (q) =>
					q.eq("projectId", project._id),
				)
				.order("desc")
				.take(20),
			getCreditState(
				ctx,
				user._id,
				getPersistedPlanTier(user.plan),
				Date.now(),
			),
		]);

		return {
			project,
			files,
			messages,
			builds,
			credits: {
				allowance: credits.allowance,
				used: credits.used,
				remaining: credits.remaining,
				resetAt: credits.resetAt,
			},
		};
	},
});

export const startBuild = mutation({
	args: {
		projectId: v.id("kodeWebProjects"),
		prompt: v.string(),
		mode: v.union(v.literal("build"), v.literal("plan")),
		attachmentContext: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const project = await requireOwnedProject(ctx, args.projectId, user._id);
		const prompt = args.prompt.trim();
		if (prompt.length < 3 || prompt.length > 8_000) {
			throw new ConvexError({
				code: "INVALID_PROMPT",
				message: "Describe the change in 3 to 8,000 characters.",
			});
		}
		if (project.status === "building") {
			throw new ConvexError({
				code: "BUILD_IN_PROGRESS",
				message: "This project already has a build in progress.",
			});
		}

		if ((args.attachmentContext?.length ?? 0) > 250_000) {
			throw new ConvexError({
				code: "ATTACHMENTS_TOO_LARGE",
				message: "Attached text is too large for one Kode request.",
			});
		}

		const now = Date.now();
		const planTier = getPersistedPlanTier(user.plan);
		const credits = await getCreditState(ctx, user._id, planTier, now);
		const buildLimit = PLAN_DEFINITIONS[planTier].kodeBuilds;
		if (args.mode === "build") {
			const buildsUsed = await getMonthlyBuildCount(
				ctx,
				user._id,
				buildLimit,
				now,
			);
			if (buildsUsed >= buildLimit) {
				throw new ConvexError({
					code: "KODE_BUILD_LIMIT_REACHED",
					message: `${PLAN_DEFINITIONS[planTier].name} includes ${buildLimit} Kode builds per month.`,
				});
			}
		}
		const reservation =
			args.mode === "build"
				? KODE_WEB_BUILD_CREDIT_RESERVATION
				: KODE_WEB_PLAN_CREDIT_RESERVATION;
		if (credits.remaining < reservation) {
			throw new ConvexError({
				code: "KODE_CREDITS_EXHAUSTED",
				message:
					args.mode === "build"
						? `A build needs ${KODE_WEB_BUILD_CREDIT_RESERVATION} available credits. Unused reserved credits are returned after generation.`
						: "You have used all Kode credits for this month.",
			});
		}
		await consumeAiUsageCredits(
			ctx,
			user,
			reservation * AI_USAGE_CREDIT_COSTS.kodeCredit,
		);

		if (credits.row) {
			await ctx.db.patch(credits.row._id, {
				allowance: credits.allowance,
				used: credits.used + reservation,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("kodeWebCredits", {
				ownerId: user._id,
				monthKey: credits.monthKey,
				allowance: credits.allowance,
				used: reservation,
				updatedAt: now,
			});
		}

		const buildId = await ctx.db.insert("kodeWebBuilds", {
			projectId: project._id,
			ownerId: user._id,
			prompt,
			mode: args.mode,
			status: "queued",
			targetVersion:
				args.mode === "build"
					? project.activeVersion + 1
					: project.activeVersion,
			creditCost: reservation,
			creditMonthKey: credits.monthKey,
			model: KODE_WEB_MODEL_ID,
			attachmentContext: args.attachmentContext,
			createdAt: now,
		});

		const lastMessage = await ctx.db
			.query("kodeWebMessages")
			.withIndex("by_project_and_order", (q) => q.eq("projectId", project._id))
			.order("desc")
			.first();
		await ctx.db.insert("kodeWebMessages", {
			projectId: project._id,
			ownerId: user._id,
			role: "user",
			content: prompt,
			order: (lastMessage?.order ?? -1) + 1,
			buildId,
			createdAt: now,
		});

		await ctx.db.patch(project._id, {
			status: "building",
			lastError: undefined,
			updatedAt: now,
			lastBuildAt: now,
		});
		await ctx.scheduler.runAfter(0, internal.kodeWebWorker.run, { buildId });

		return {
			buildId,
			targetVersion:
				args.mode === "build"
					? project.activeVersion + 1
					: project.activeVersion,
			credits: {
				allowance: credits.allowance,
				used: credits.used + reservation,
				remaining: credits.remaining - reservation,
				resetAt: credits.resetAt,
			},
		};
	},
});

export const getBuildForWorker = internalQuery({
	args: { buildId: v.id("kodeWebBuilds") },
	handler: async (ctx, args) => {
		const build = await ctx.db.get(args.buildId);
		if (!build || build.status !== "queued") return null;
		const [project, owner] = await Promise.all([
			ctx.db.get(build.projectId),
			ctx.db.get(build.ownerId),
		]);
		if (!project || !owner || project.ownerId !== build.ownerId) {
			return null;
		}

		const files =
			project.activeVersion > 0
				? await ctx.db
						.query("kodeWebFiles")
						.withIndex("by_project_and_version", (q) =>
							q
								.eq("projectId", project._id)
								.eq("version", project.activeVersion),
						)
						.take(KODE_WEB_MAX_PROJECT_FILES)
				: [];
		const messages = await ctx.db
			.query("kodeWebMessages")
			.withIndex("by_project_and_order", (q) => q.eq("projectId", project._id))
			.order("desc")
			.take(12);

		return {
			build,
			project,
			ownerId: owner._id,
			files,
			messages: messages.reverse(),
		};
	},
});

export const setWorkerStage = internalMutation({
	args: {
		buildId: v.id("kodeWebBuilds"),
		status: v.union(
			v.literal("planning"),
			v.literal("generating"),
			v.literal("validating"),
		),
	},
	handler: async (ctx, args) => {
		const build = await ctx.db.get(args.buildId);
		if (!build || build.status === "completed" || build.status === "failed") {
			return null;
		}
		await ctx.db.patch(build._id, { status: args.status });
		return null;
	},
});

export const completeWorkerBuild = internalMutation({
	args: {
		buildId: v.id("kodeWebBuilds"),
		title: v.string(),
		summary: v.string(),
		files: v.array(
			v.object({
				path: v.string(),
				language: v.string(),
				content: v.string(),
			}),
		),
		inputTokens: v.number(),
		outputTokens: v.number(),
		totalTokens: v.number(),
		validation: v.string(),
	},
	handler: async (ctx, args) => {
		const build = await ctx.db.get(args.buildId);
		if (!build || build.status === "completed" || build.status === "failed") {
			return null;
		}
		const project = await ctx.db.get(build.projectId);
		if (!project || project.ownerId !== build.ownerId) return null;

		const mode = build.mode ?? "build";
		if (mode === "build") {
			if (
				args.files.length < 1 ||
				args.files.length > KODE_WEB_MAX_PROJECT_FILES
			) {
				throw new Error("Worker returned an invalid number of files.");
			}
			const seen = new Set<string>();
			for (const file of args.files) {
				if (!ALLOWED_FILE_PATHS.has(file.path) || seen.has(file.path)) {
					throw new Error(`Worker returned an invalid file: ${file.path}`);
				}
				if (
					new TextEncoder().encode(file.content).byteLength >
					KODE_WEB_MAX_FILE_BYTES
				) {
					throw new Error(`Worker returned an oversized file: ${file.path}`);
				}
				seen.add(file.path);
			}
		}

		const now = Date.now();
		if (mode === "build") {
			for (const file of args.files) {
				await ctx.db.insert("kodeWebFiles", {
					projectId: project._id,
					ownerId: build.ownerId,
					version: build.targetVersion,
					path: file.path,
					language: file.language,
					content: file.content,
					createdAt: now,
					updatedAt: now,
				});
			}
		}

		const lastMessage = await ctx.db
			.query("kodeWebMessages")
			.withIndex("by_project_and_order", (q) => q.eq("projectId", project._id))
			.order("desc")
			.first();
		await ctx.db.insert("kodeWebMessages", {
			projectId: project._id,
			ownerId: build.ownerId,
			role: "assistant",
			content: args.summary.trim().slice(0, 8_000),
			order: (lastMessage?.order ?? -1) + 1,
			buildId: build._id,
			createdAt: now,
		});

		const chargedCredits = Math.min(
			build.creditCost,
			getKodeWebCreditCharge(args.totalTokens),
		);
		const credits = await ctx.db
			.query("kodeWebCredits")
			.withIndex("by_owner_and_month", (q) =>
				q.eq("ownerId", build.ownerId).eq("monthKey", build.creditMonthKey),
			)
			.unique();
		if (credits) {
			await ctx.db.patch(credits._id, {
				used: Math.max(0, credits.used - build.creditCost + chargedCredits),
				updatedAt: now,
			});
		}
		const owner = await ctx.db.get(build.ownerId);
		if (owner && build.creditCost > chargedCredits) {
			await refundAiUsageCredits(
				ctx,
				owner,
				(build.creditCost - chargedCredits) * AI_USAGE_CREDIT_COSTS.kodeCredit,
			);
		}

		await ctx.db.patch(build._id, {
			status: "completed",
			chargedCredits,
			inputTokens: Math.max(0, args.inputTokens),
			outputTokens: Math.max(0, args.outputTokens),
			totalTokens: Math.max(0, args.totalTokens),
			validation: args.validation.slice(0, 500),
			completedAt: now,
		});
		await ctx.db.patch(project._id, {
			title:
				mode === "build"
					? args.title.trim().slice(0, 100) || project.title
					: project.title,
			description: args.summary.trim().slice(0, 240),
			status:
				mode === "build"
					? "ready"
					: project.activeVersion > 0
						? "ready"
						: "draft",
			activeVersion:
				mode === "build" ? build.targetVersion : project.activeVersion,
			lastError: undefined,
			updatedAt: now,
		});
		return null;
	},
});

export const failWorkerBuild = internalMutation({
	args: { buildId: v.id("kodeWebBuilds"), errorMessage: v.string() },
	handler: async (ctx, args) => {
		const build = await ctx.db.get(args.buildId);
		if (!build || build.status === "completed" || build.status === "failed") {
			return null;
		}
		const now = Date.now();
		const project = await ctx.db.get(build.projectId);
		await ctx.db.patch(build._id, {
			status: "failed",
			errorMessage: args.errorMessage.trim().slice(0, 500) || "Build failed.",
			chargedCredits: 0,
			completedAt: now,
		});
		if (project) {
			await ctx.db.patch(project._id, {
				status: project.activeVersion > 0 ? "ready" : "error",
				lastError: args.errorMessage.trim().slice(0, 500) || "Build failed.",
				updatedAt: now,
			});
		}
		const credits = await ctx.db
			.query("kodeWebCredits")
			.withIndex("by_owner_and_month", (q) =>
				q.eq("ownerId", build.ownerId).eq("monthKey", build.creditMonthKey),
			)
			.unique();
		if (credits) {
			await ctx.db.patch(credits._id, {
				used: Math.max(0, credits.used - build.creditCost),
				updatedAt: now,
			});
		}
		const owner = await ctx.db.get(build.ownerId);
		if (owner) {
			await refundAiUsageCredits(
				ctx,
				owner,
				build.creditCost * AI_USAGE_CREDIT_COSTS.kodeCredit,
			);
		}
		return null;
	},
});

export const updateFile = mutation({
	args: {
		projectId: v.id("kodeWebProjects"),
		path: v.string(),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const project = await requireOwnedProject(ctx, args.projectId, user._id);
		if (!ALLOWED_FILE_PATHS.has(args.path) || project.activeVersion < 1) {
			throw new ConvexError({
				code: "INVALID_FILE",
				message: "File not found.",
			});
		}
		if (
			new TextEncoder().encode(args.content).byteLength >
			KODE_WEB_MAX_FILE_BYTES
		) {
			throw new ConvexError({
				code: "FILE_TOO_LARGE",
				message: "This file is too large to save.",
			});
		}
		const file = await ctx.db
			.query("kodeWebFiles")
			.withIndex("by_project_and_version_and_path", (q) =>
				q
					.eq("projectId", project._id)
					.eq("version", project.activeVersion)
					.eq("path", args.path),
			)
			.unique();
		if (!file) {
			throw new ConvexError({
				code: "INVALID_FILE",
				message: "File not found.",
			});
		}
		await ctx.db.patch(file._id, {
			content: args.content,
			updatedAt: Date.now(),
		});
		await ctx.db.patch(project._id, { updatedAt: Date.now() });
		return null;
	},
});

export const renameProject = mutation({
	args: { projectId: v.id("kodeWebProjects"), title: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const project = await requireOwnedProject(ctx, args.projectId, user._id);
		const title = args.title.trim();
		if (!title || title.length > 100) {
			throw new ConvexError({
				code: "INVALID_TITLE",
				message: "Enter a project title.",
			});
		}
		await ctx.db.patch(project._id, { title, updatedAt: Date.now() });
		return null;
	},
});

export const toggleStar = mutation({
	args: { projectId: v.id("kodeWebProjects") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const project = await requireOwnedProject(ctx, args.projectId, user._id);
		const starred = !project.starred;
		await ctx.db.patch(project._id, { starred, updatedAt: Date.now() });
		return { starred };
	},
});

export const deleteProject = mutation({
	args: { projectId: v.id("kodeWebProjects") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		requireKode(user);
		const project = await requireOwnedProject(ctx, args.projectId, user._id);
		const [messages, files, builds] = await Promise.all([
			ctx.db
				.query("kodeWebMessages")
				.withIndex("by_project", (q) => q.eq("projectId", project._id))
				.take(200),
			ctx.db
				.query("kodeWebFiles")
				.withIndex("by_project_and_version", (q) =>
					q.eq("projectId", project._id),
				)
				.take(200),
			ctx.db
				.query("kodeWebBuilds")
				.withIndex("by_project_and_created", (q) =>
					q.eq("projectId", project._id),
				)
				.take(100),
		]);
		for (const message of messages) await ctx.db.delete(message._id);
		for (const file of files) await ctx.db.delete(file._id);
		for (const build of builds) await ctx.db.delete(build._id);
		await ctx.db.delete(project._id);
		return null;
	},
});
