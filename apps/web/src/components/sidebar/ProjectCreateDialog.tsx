"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

const PROJECT_COLORS = [
	"#6366f1",
	"#ec4899",
	"#f59e0b",
	"#10b981",
	"#06b6d4",
	"#ef4444",
];

type ProjectCreateDialogProps = {
	isOpen: boolean;
	onClose: () => void;
	onCreated?: (projectId: string) => void;
};

export function ProjectCreateDialog({
	isOpen,
	onClose,
	onCreated,
}: ProjectCreateDialogProps) {
	const createProject = useMutation(api.projects.createProject);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [color, setColor] = useState(PROJECT_COLORS[0]);
	const [isSaving, setIsSaving] = useState(false);

	const reset = () => {
		setName("");
		setDescription("");
		setColor(PROJECT_COLORS[0]);
	};

	const handleClose = () => {
		if (isSaving) return;
		reset();
		onClose();
	};

	const handleCreate = async () => {
		const trimmed = name.trim();
		if (!trimmed) {
			toast.error("Please enter a project name");
			return;
		}
		setIsSaving(true);
		try {
			const projectId = await createProject({
				name: trimmed,
				description: description.trim() || undefined,
				color,
			});
			toast.success("Project created");
			reset();
			onCreated?.(projectId);
			onClose();
		} catch (err) {
			const message =
				(err as { data?: { message?: string } })?.data?.message ||
				(err instanceof Error ? err.message : "Failed to create project");
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="glass-strong rounded-2xl sm:max-w-md">
				<DialogHeader>
					<span className="eyebrow">Project</span>
					<DialogTitle className="text-xl font-semibold tracking-tight">
						New project
					</DialogTitle>
					<DialogDescription>
						Group related chats together in one workspace.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<label
							htmlFor="project-name"
							className="text-xs font-medium text-muted-foreground"
						>
							Name
						</label>
						<Input
							id="project-name"
							autoFocus
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									void handleCreate();
								}
							}}
							placeholder="e.g. Kontinue AI"
							maxLength={80}
						/>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="project-description"
							className="text-xs font-medium text-muted-foreground"
						>
							Description{" "}
							<span className="text-muted-foreground/60">(optional)</span>
						</label>
						<Textarea
							id="project-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="What is this project about?"
							maxLength={500}
							className="min-h-[72px] resize-none"
						/>
					</div>

					<fieldset className="space-y-1.5">
						<legend className="text-xs font-medium text-muted-foreground">
							Color
						</legend>
						<div className="flex items-center gap-2">
							{PROJECT_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									onClick={() => setColor(c)}
									aria-label={`Select color ${c}`}
									className="size-6 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110"
									style={{
										backgroundColor: c,
										boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
									}}
								/>
							))}
						</div>
					</fieldset>
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="ghost" onClick={handleClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button
						onClick={() => void handleCreate()}
						disabled={isSaving}
						className="glow-button text-primary-foreground disabled:opacity-60"
					>
						{isSaving ? "Creating…" : "Create project"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
