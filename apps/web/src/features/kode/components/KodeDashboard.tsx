"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
	KODE_WEB_BUILD_CREDIT_RESERVATION,
	KODE_WEB_MODEL_ID,
	KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, LoaderCircle, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePlanTier } from "../../../lib/use-plan-tier";
import { ChatInput } from "../../chat/components/ChatInput";
import { KodeAccessGate } from "./KodeAccessGate";
import {
	KodeComposerControls,
	type KodeComposerMode,
} from "./KodeComposerControls";
import { KodeProjectCard } from "./KodeProjectCard";

const STARTERS = [
	"Build a clean client portal for a creative agency",
	"Create a personal finance dashboard with interactive budgets",
	"Design a launch page for a developer tool",
];

const keepKodeModel = () => undefined;

export function KodeDashboard() {
	const router = useRouter();
	const { user } = useUser();
	const planTier = usePlanTier();
	const projects = useQuery(api.kodeWeb.listProjects, { limit: 24 });
	const credits = useQuery(api.kodeWeb.getCredits, {});
	const createProject = useMutation(api.kodeWeb.createProject);
	const [isBuilding, setIsBuilding] = useState(false);
	const [activePrompt, setActivePrompt] = useState<string | null>(null);
	const [mode, setMode] = useState<KodeComposerMode>("build");

	const buildProject = async (prompt: string, files?: File[]) => {
		if (isBuilding || planTier !== "pro") return;
		setIsBuilding(true);
		setActivePrompt(prompt);
		let projectId: Id<"kodeWebProjects"> | null = null;
		try {
			projectId = await createProject({ prompt });
			const formData = new FormData();
			formData.set("projectId", projectId);
			formData.set("prompt", prompt);
			formData.set("mode", mode);
			for (const file of files ?? []) formData.append("files", file);

			const response = await fetch("/api/kode/build", {
				method: "POST",
				body: formData,
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok)
				throw new Error(result.error || "Kode could not build the project.");
			toast.success(mode === "build" ? "Build queued." : "Plan queued.");
			router.push(`/kode/${projectId}`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Kode could not build the project.",
			);
			if (projectId) router.push(`/kode/${projectId}`);
		} finally {
			setIsBuilding(false);
			setActivePrompt(null);
		}
	};

	if (planTier !== "pro") return <KodeAccessGate />;

	const firstName = user?.firstName?.trim() || "there";
	const requiredCredits =
		mode === "build"
			? KODE_WEB_BUILD_CREDIT_RESERVATION
			: KODE_WEB_PLAN_CREDIT_RESERVATION;

	return (
		<div className="min-h-full overflow-x-hidden bg-[oklch(0.145_0.01_345)] text-white">
			<div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 pt-20 sm:px-7 lg:pt-16">
				<section className="mx-auto mt-10 w-full max-w-3xl text-center sm:mt-14">
					<div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-medium text-white/65 backdrop-blur-xl">
						<Sparkles className="size-3.5 text-[oklch(0.72_0.21_350)]" />
						From idea to working interface
					</div>
					<h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
						What should we build, {firstName}?
					</h1>
					<p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-6 text-white/48 sm:text-base">
						Describe the product. Kode creates the interface, interactions,
						source files, and a live preview you can keep refining.
					</p>

					<div className="mt-9 text-left">
						<div className="[&_.glow-rail]:border-white/10 [&_.glow-rail]:bg-[oklch(0.19_0.012_345/0.92)] [&_.glow-rail]:shadow-[0_28px_90px_-36px_black]">
							<ChatInput
								onSend={(message, files) => void buildProject(message, files)}
								isLoading={isBuilding}
								disabled={
									isBuilding ||
									credits === undefined ||
									(credits?.remaining ?? 0) < requiredCredits
								}
								model={KODE_WEB_MODEL_ID}
								onModelChange={keepKodeModel}
								showModelSelector={false}
								placeholder={
									mode === "build"
										? "Describe the app you want Kode to build…"
										: "Describe the idea you want to plan…"
								}
								footerAccessory={
									<KodeComposerControls
										mode={mode}
										onModeChange={setMode}
										remainingCredits={credits?.remaining}
										disabled={isBuilding}
									/>
								}
							/>
						</div>
					</div>

					{isBuilding ? (
						<div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-xs text-white/55">
							<LoaderCircle className="size-3.5 animate-spin text-primary" />
							{mode === "build" ? "Queueing build" : "Queueing plan"}
							{activePrompt
								? ` “${activePrompt.slice(0, 34)}${activePrompt.length > 34 ? "…" : ""}”`
								: ""}
						</div>
					) : (
						<div className="mt-5 flex flex-wrap justify-center gap-2">
							{STARTERS.map((starter) => (
								<button
									key={starter}
									type="button"
									onClick={() => void buildProject(starter)}
									className="group inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] text-white/45 transition-colors hover:border-white/15 hover:bg-white/[0.07] hover:text-white/75"
								>
									{starter}
									<ArrowRight className="size-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
								</button>
							))}
						</div>
					)}
				</section>

				<section className="mt-20">
					<div className="mb-5 flex items-end justify-between gap-4">
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
								Workspace
							</div>
							<h2 className="mt-1 text-xl font-semibold tracking-tight">
								Your projects
							</h2>
						</div>
						<span className="text-xs text-white/35">
							{projects?.length ?? 0} project{projects?.length === 1 ? "" : "s"}
						</span>
					</div>

					{projects === undefined ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{[0, 1, 2].map((item) => (
								<div
									key={item}
									className="aspect-[1.25] animate-pulse rounded-[1.4rem] bg-white/[0.04]"
								/>
							))}
						</div>
					) : projects.length > 0 ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{projects.map((project) => (
								<KodeProjectCard key={project._id} project={project} />
							))}
						</div>
					) : (
						<div className="flex min-h-52 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.025] text-center">
							<span className="flex size-10 items-center justify-center rounded-xl bg-white/[0.05] text-white/45">
								<Plus className="size-4" />
							</span>
							<p className="mt-3 text-sm font-medium">
								Your first project starts above
							</p>
							<p className="mt-1 text-xs text-white/35">
								Describe an idea and Kode will build it.
							</p>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
