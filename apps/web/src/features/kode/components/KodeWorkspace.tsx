"use client";

import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
	KODE_WEB_BUILD_CREDIT_RESERVATION,
	KODE_WEB_MODEL_ID,
	KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowLeft,
	Braces,
	Check,
	Code2,
	Download,
	Eye,
	FileCode2,
	LoaderCircle,
	MoreHorizontal,
	RefreshCw,
	Save,
	Star,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePlanTier } from "../../../lib/use-plan-tier";
import { ChatInput } from "../../chat/components/ChatInput";
import { buildKodePreviewDocument, kodeDownloadFilename } from "../lib/preview";
import { KodeAccessGate } from "./KodeAccessGate";
import {
	KodeComposerControls,
	type KodeComposerMode,
} from "./KodeComposerControls";

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

function formatTime(timestamp: number): string {
	return TIME_FORMATTER.format(new Date(timestamp));
}

const keepKodeModel = () => undefined;

export function KodeWorkspace() {
	const params = useParams();
	const router = useRouter();
	const projectId = params.projectId as Id<"kodeWebProjects"> | undefined;
	const planTier = usePlanTier();
	const workspace = useQuery(
		api.kodeWeb.getWorkspace,
		projectId ? { projectId } : "skip",
	);
	const updateFile = useMutation(api.kodeWeb.updateFile);
	const renameProject = useMutation(api.kodeWeb.renameProject);
	const toggleStar = useMutation(api.kodeWeb.toggleStar);
	const deleteProject = useMutation(api.kodeWeb.deleteProject);

	const [isBuilding, setIsBuilding] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [selectedPath, setSelectedPath] = useState("index.html");
	const [draftContent, setDraftContent] = useState("");
	const [lastSyncedContent, setLastSyncedContent] = useState("");
	const [workspaceView, setWorkspaceView] = useState<"preview" | "code">(
		"preview",
	);
	const [previewNonce, setPreviewNonce] = useState(0);
	const [titleDraft, setTitleDraft] = useState("");
	const [mode, setMode] = useState<KodeComposerMode>("build");

	const selectedFile = workspace?.files.find(
		(file) => file.path === selectedPath,
	);
	const selectedFileId = selectedFile?._id;
	const selectedFileContent = selectedFile?.content;
	useEffect(() => {
		if (!selectedFileId || selectedFileContent === undefined) return;
		setDraftContent(selectedFileContent);
		setLastSyncedContent(selectedFileContent);
	}, [selectedFileId, selectedFileContent]);

	useEffect(() => {
		if (workspace?.project.title) setTitleDraft(workspace.project.title);
	}, [workspace?.project.title]);

	const previewFiles = useMemo(
		() =>
			(workspace?.files ?? []).map((file) => ({
				path: file.path,
				content: file.path === selectedPath ? draftContent : file.content,
			})),
		[workspace?.files, selectedPath, draftContent],
	);
	const previewDocument = useMemo(
		() => buildKodePreviewDocument(previewFiles),
		[previewFiles],
	);
	const isDirty = draftContent !== lastSyncedContent;
	const buildInProgress =
		isBuilding || workspace?.project.status === "building";
	const requiredCredits =
		mode === "build"
			? KODE_WEB_BUILD_CREDIT_RESERVATION
			: KODE_WEB_PLAN_CREDIT_RESERVATION;

	const saveSelectedFile = async () => {
		if (!projectId || !selectedFile || !isDirty || isSaving) return;
		setIsSaving(true);
		try {
			await updateFile({
				projectId,
				path: selectedFile.path,
				content: draftContent,
			});
			setLastSyncedContent(draftContent);
			toast.success(`${selectedFile.path} saved.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save the file.",
			);
			throw error;
		} finally {
			setIsSaving(false);
		}
	};

	const runBuild = async (prompt: string, files?: File[]) => {
		if (
			!projectId ||
			buildInProgress ||
			(workspace?.credits.remaining ?? 0) < requiredCredits
		)
			return;
		setIsBuilding(true);
		try {
			if (isDirty) await saveSelectedFile();
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
				throw new Error(result.error || "Kode could not complete the build.");
			if (mode === "build") setWorkspaceView("preview");
			toast.success(mode === "build" ? "Build queued." : "Plan queued.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Kode could not complete the build.",
			);
		} finally {
			setIsBuilding(false);
		}
	};

	const saveTitle = async () => {
		if (!projectId || !workspace) return;
		const nextTitle = titleDraft.trim();
		if (!nextTitle || nextTitle === workspace.project.title) {
			setTitleDraft(workspace.project.title);
			return;
		}
		try {
			await renameProject({ projectId, title: nextTitle });
		} catch (error) {
			setTitleDraft(workspace.project.title);
			toast.error(
				error instanceof Error
					? error.message
					: "Could not rename the project.",
			);
		}
	};

	const downloadProject = () => {
		if (!workspace) return;
		const blob = new Blob([previewDocument], {
			type: "text/html;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = kodeDownloadFilename(workspace.project.title);
		anchor.click();
		URL.revokeObjectURL(url);
	};

	const removeProject = async () => {
		if (
			!projectId ||
			!window.confirm("Delete this Kode project and all of its versions?")
		)
			return;
		try {
			await deleteProject({ projectId });
			toast.success("Project deleted.");
			router.push("/kode");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not delete the project.",
			);
		}
	};

	if (!canAccessPlanFeature(planTier, "kode")) return <KodeAccessGate />;

	if (workspace === undefined) {
		return (
			<div className="flex h-full items-center justify-center bg-[oklch(0.145_0.01_345)] text-white/55">
				<LoaderCircle className="mr-2 size-4 animate-spin text-primary" />
				Opening Kode workspace…
			</div>
		);
	}

	if (workspace === null) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 bg-[oklch(0.145_0.01_345)] px-5 text-center text-white">
				<Braces className="size-8 text-white/35" />
				<p className="text-sm text-white/55">
					This Kode project does not exist.
				</p>
				<Link
					href="/kode"
					className="text-sm font-medium text-primary hover:underline"
				>
					Back to Kode
				</Link>
			</div>
		);
	}

	return (
		<div className="grid h-full min-h-0 bg-[oklch(0.145_0.01_345)] text-white lg:grid-cols-[360px_minmax(0,1fr)]">
			<aside className="flex min-h-[42rem] min-w-0 flex-col border-b border-white/8 bg-[oklch(0.17_0.01_345)] lg:min-h-0 lg:border-b-0 lg:border-r">
				<header className="flex h-14 items-center gap-2 border-b border-white/8 px-3">
					<Link
						href="/kode"
						aria-label="Back to Kode projects"
						className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/7 hover:text-white"
					>
						<ArrowLeft className="size-4" />
					</Link>
					<input
						value={titleDraft}
						onChange={(event) => setTitleDraft(event.target.value)}
						onBlur={() => void saveTitle()}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}}
						aria-label="Project title"
						className="min-w-0 flex-1 truncate border-0 bg-transparent text-sm font-semibold outline-none placeholder:text-white/25"
					/>
					<button
						type="button"
						onClick={() =>
							void toggleStar({ projectId: workspace.project._id })
						}
						aria-label={
							workspace.project.starred ? "Unstar project" : "Star project"
						}
						className="flex size-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/7 hover:text-white"
					>
						<Star
							className={cn(
								"size-4",
								workspace.project.starred ? "fill-primary text-primary" : "",
							)}
						/>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Project actions"
								className="flex size-8 items-center justify-center rounded-lg text-white/35 hover:bg-white/7 hover:text-white"
							>
								<MoreHorizontal className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={downloadProject}>
								<Download className="size-4" /> Download HTML
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => void removeProject()}
							>
								<Trash2 className="size-4" /> Delete project
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>

				<div className="kode-web-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
					<div className="mb-4 flex items-center justify-between px-1">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
							Conversation
						</div>
					</div>

					<div className="space-y-3">
						{workspace.messages.length > 0 ? (
							workspace.messages.map((message) => (
								<div
									key={message._id}
									className={cn(
										"rounded-2xl px-3.5 py-3 text-[13px] leading-5",
										message.role === "user"
											? "ml-8 bg-primary text-primary-foreground"
											: "mr-5 border border-white/8 bg-white/[0.035] text-white/72",
									)}
								>
									<p className="whitespace-pre-wrap">{message.content}</p>
									<div
										className={cn(
											"mt-2 text-[10px]",
											message.role === "user"
												? "text-primary-foreground/55"
												: "text-white/28",
										)}
									>
										{message.role === "assistant" ? "Kode" : "You"} ·{" "}
										{formatTime(message.createdAt)}
									</div>
								</div>
							))
						) : (
							<div className="rounded-2xl border border-dashed border-white/8 px-4 py-8 text-center text-xs leading-5 text-white/35">
								Ask Kode to build or change anything in this project.
							</div>
						)}

						{buildInProgress ? (
							<div className="mr-5 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/8 px-3.5 py-3 text-xs text-white/65">
								<LoaderCircle className="size-4 animate-spin text-primary" />
								{(workspace.builds[0]?.mode ?? "build") === "plan"
									? "Kode is preparing the plan…"
									: "Kode is editing and validating the project…"}
							</div>
						) : null}
					</div>
				</div>

				<div className="border-t border-white/8 p-3 [&_.glow-rail]:border-white/10 [&_.glow-rail]:bg-white/[0.035]">
					<ChatInput
						onSend={(message, files) => void runBuild(message, files)}
						isLoading={buildInProgress}
						disabled={
							buildInProgress || workspace.credits.remaining < requiredCredits
						}
						model={KODE_WEB_MODEL_ID}
						onModelChange={keepKodeModel}
						showModelSelector={false}
						placeholder={
							workspace.credits.remaining < requiredCredits
								? "Not enough Kode credits for this mode"
								: mode === "build"
									? "Ask Kode to change this app…"
									: "Discuss the next change before building…"
						}
						footerAccessory={
							<KodeComposerControls
								mode={mode}
								onModeChange={setMode}
								remainingCredits={workspace.credits.remaining}
								disabled={buildInProgress}
							/>
						}
					/>
				</div>
			</aside>

			<main className="flex min-h-[38rem] min-w-0 flex-col lg:min-h-0">
				<header className="flex h-14 items-center justify-between gap-3 border-b border-white/8 bg-[oklch(0.16_0.01_345)] px-3 sm:px-4">
					<div className="flex items-center gap-1 rounded-xl border border-white/8 bg-black/15 p-1">
						<button
							type="button"
							onClick={() => setWorkspaceView("preview")}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
								workspaceView === "preview"
									? "bg-white/10 text-white"
									: "text-white/40 hover:text-white/70",
							)}
						>
							<Eye className="size-3.5" /> Preview
						</button>
						<button
							type="button"
							onClick={() => setWorkspaceView("code")}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
								workspaceView === "code"
									? "bg-white/10 text-white"
									: "text-white/40 hover:text-white/70",
							)}
						>
							<Code2 className="size-3.5" /> Code
						</button>
					</div>

					<div className="flex items-center gap-1.5">
						<span className="hidden text-[11px] text-white/30 sm:inline">
							v{workspace.project.activeVersion}
						</span>
						<button
							type="button"
							onClick={() => setPreviewNonce((current) => current + 1)}
							aria-label="Refresh preview"
							className="flex size-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/7 hover:text-white"
						>
							<RefreshCw className="size-3.5" />
						</button>
						<button
							type="button"
							onClick={downloadProject}
							className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-3 text-xs font-medium text-white/65 hover:bg-white/[0.08] hover:text-white"
						>
							<Download className="size-3.5" />
							<span className="hidden sm:inline">Download</span>
						</button>
					</div>
				</header>

				{workspace.files.length === 0 ? (
					<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center">
						<div className="flex size-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.035] text-primary">
							{buildInProgress ? (
								<LoaderCircle className="size-6 animate-spin" />
							) : (
								<Braces className="size-6" />
							)}
						</div>
						<h2 className="mt-4 text-lg font-semibold">
							{buildInProgress ? "Kode is assembling your app" : "No build yet"}
						</h2>
						<p className="mt-2 max-w-sm text-sm leading-6 text-white/40">
							{workspace.project.lastError ??
								"Use the conversation panel to describe what you want to build."}
						</p>
					</div>
				) : workspaceView === "preview" ? (
					<div className="min-h-0 flex-1 bg-[oklch(0.1_0.005_345)] p-2 sm:p-3">
						<div className="h-full overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl">
							<iframe
								key={`${workspace.project.activeVersion}-${previewNonce}`}
								title={`${workspace.project.title} preview`}
								sandbox="allow-scripts"
								srcDoc={previewDocument}
								className="h-full min-h-[36rem] w-full bg-white"
							/>
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col bg-[oklch(0.125_0.008_345)]">
						<div className="flex items-center gap-1 overflow-x-auto border-b border-white/8 px-2 pt-2">
							{workspace.files.map((file) => (
								<button
									key={file._id}
									type="button"
									onClick={() => setSelectedPath(file.path)}
									className={cn(
										"flex h-9 shrink-0 items-center gap-1.5 rounded-t-lg border-x border-t px-3 text-xs transition-colors",
										selectedPath === file.path
											? "border-white/10 bg-white/[0.055] text-white"
											: "border-transparent text-white/35 hover:text-white/65",
									)}
								>
									<FileCode2 className="size-3.5" /> {file.path}
								</button>
							))}
							<div className="ml-auto flex items-center gap-2 px-2 pb-1">
								<span className="text-[10px] text-white/25">
									{isDirty ? "Unsaved changes" : "Saved"}
								</span>
								<button
									type="button"
									onClick={() => void saveSelectedFile()}
									disabled={!isDirty || isSaving}
									className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/8 px-2.5 text-[11px] font-medium text-white/65 hover:bg-white/12 disabled:opacity-35"
								>
									{isSaving ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : isDirty ? (
										<Save className="size-3" />
									) : (
										<Check className="size-3" />
									)}
									Save
								</button>
							</div>
						</div>
						<textarea
							value={draftContent}
							onChange={(event) => setDraftContent(event.target.value)}
							spellCheck={false}
							aria-label={`Edit ${selectedPath}`}
							className="kode-web-scroll min-h-0 flex-1 resize-none border-0 bg-transparent p-5 font-mono text-[12px] leading-6 text-[oklch(0.84_0.03_345)] outline-none selection:bg-primary/30"
						/>
					</div>
				)}
			</main>
		</div>
	);
}
