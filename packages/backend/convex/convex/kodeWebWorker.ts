"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

type WorkerPayload = {
	build: Doc<"kodeWebBuilds">;
	project: Doc<"kodeWebProjects">;
	ownerId: Id<"users">;
	files: Doc<"kodeWebFiles">[];
	messages: Doc<"kodeWebMessages">[];
};

type WorkerResult = {
	title: string;
	summary: string;
	files: Array<{ path: string; language: string; content: string }>;
	usage: { inputTokens: number; outputTokens: number; totalTokens: number };
	validation: string;
};

export const run = internalAction({
	args: { buildId: v.id("kodeWebBuilds") },
	handler: async (ctx, args): Promise<null> => {
		const payload: WorkerPayload | null = await ctx.runQuery(
			internal.kodeWeb.getBuildForWorker,
			{ buildId: args.buildId },
		);
		if (!payload) return null;

		const appUrl = process.env.APP_URL?.replace(/\/$/, "");
		const secret = process.env.KODE_WEB_WORKER_SECRET;
		if (!appUrl || !secret) {
			await ctx.runMutation(internal.kodeWeb.failWorkerBuild, {
				buildId: args.buildId,
				errorMessage:
					"Kode background jobs are not configured. Set APP_URL and KODE_WEB_WORKER_SECRET.",
			});
			return null;
		}

		await ctx.runMutation(internal.kodeWeb.setWorkerStage, {
			buildId: args.buildId,
			status:
				(payload.build.mode ?? "build") === "plan" ? "planning" : "generating",
		});

		try {
			const response = await fetch(`${appUrl}/api/kode/worker`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-kode-worker-secret": secret,
				},
				body: JSON.stringify({
					ownerId: payload.ownerId,
					buildId: payload.build._id,
					projectId: payload.project._id,
					projectTitle: payload.project.title,
					mode: payload.build.mode ?? "build",
					prompt: payload.build.prompt,
					attachmentContext: payload.build.attachmentContext ?? "",
					files: payload.files.map((file) => ({
						path: file.path,
						content: file.content,
					})),
					messages: payload.messages.map((message) => ({
						role: message.role,
						content: message.content,
					})),
				}),
			});
			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(
					`Kode worker returned ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
				);
			}
			const result = (await response.json()) as WorkerResult;
			await ctx.runMutation(internal.kodeWeb.completeWorkerBuild, {
				buildId: args.buildId,
				title: result.title,
				summary: result.summary,
				files: result.files,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				totalTokens: result.usage.totalTokens,
				validation: result.validation,
			});
		} catch (error) {
			console.error("[kode-web-worker] job failed", error);
			await ctx.runMutation(internal.kodeWeb.failWorkerBuild, {
				buildId: args.buildId,
				errorMessage:
					error instanceof Error
						? error.message
						: "Kode could not complete this job.",
			});
		}

		return null;
	},
});
