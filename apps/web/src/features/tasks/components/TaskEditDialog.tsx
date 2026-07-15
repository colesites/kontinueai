"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useMutation } from "convex/react";
import { useReducer } from "react";
import { toast } from "sonner";
import { PRIORITY_META, type Task } from "../lib/task-shared";
import { DateTimePicker } from "./DateTimePicker";
import { RecurrenceField } from "./RecurrenceField";
import { ReminderField } from "./ReminderField";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

type TaskFormState = {
	title: string;
	description: string;
	dueDate: number | null;
	priority: Task["priority"];
	reminder: number | null;
	recurrenceRule: string | null;
	saving: boolean;
};

type TaskFormAction = {
	type: "patch";
	patch: Partial<TaskFormState>;
};

function taskFormReducer(
	state: TaskFormState,
	action: TaskFormAction,
): TaskFormState {
	return { ...state, ...action.patch };
}

function initialTaskForm(task: Task): TaskFormState {
	return {
		title: task.title,
		description: task.description ?? "",
		dueDate: task.dueDate ?? null,
		priority: task.priority,
		reminder: task.reminderMinutesBefore ?? null,
		recurrenceRule: task.recurrenceRule ?? null,
		saving: false,
	};
}

export function TaskEditDialog({
	task,
	open,
	onOpenChange,
}: {
	task: Task | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	if (!task) return null;

	return (
		<TaskEditForm
			key={task._id}
			task={task}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

function TaskEditForm({
	task,
	open,
	onOpenChange,
}: {
	task: Task;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const updateTask = useMutation(api.tasks.updateTask);
	const [form, dispatch] = useReducer(taskFormReducer, task, initialTaskForm);
	const {
		title,
		description,
		dueDate,
		priority,
		reminder,
		recurrenceRule,
		saving,
	} = form;

	const handleSave = async () => {
		const trimmed = title.trim();
		if (!trimmed) {
			toast.error("Title can't be empty");
			return;
		}
		dispatch({ type: "patch", patch: { saving: true } });
		try {
			await updateTask({
				taskId: task._id,
				title: trimmed,
				description: description.trim() || undefined,
				dueDate: dueDate ?? null,
				priority,
				reminderMinutesBefore: dueDate != null ? (reminder ?? null) : null,
				recurring: recurrenceRule != null,
				recurrenceRule: recurrenceRule ?? null,
			});
			onOpenChange(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save task");
		} finally {
			dispatch({ type: "patch", patch: { saving: false } });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="glass-strong max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-2xl max-sm:top-2 max-sm:translate-y-0 sm:max-w-md">
				<DialogHeader>
					<span className="eyebrow">Task</span>
					<DialogTitle className="text-xl font-semibold tracking-tight">
						Edit task
					</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<Input
						value={title}
						onChange={(e) =>
							dispatch({ type: "patch", patch: { title: e.target.value } })
						}
						placeholder="Task title"
						maxLength={200}
						autoFocus
					/>
					<Textarea
						value={description}
						onChange={(e) =>
							dispatch({
								type: "patch",
								patch: { description: e.target.value },
							})
						}
						placeholder="Description (optional)"
						maxLength={2000}
						rows={3}
					/>

					<div className="flex flex-wrap items-center gap-2">
						<DateTimePicker
							value={dueDate}
							onChange={(nextDueDate) => {
								dispatch({
									type: "patch",
									patch: {
										dueDate: nextDueDate,
										...(nextDueDate == null ? { reminder: null } : {}),
									},
								});
							}}
						/>
						<div className="relative">
							<select
								value={priority}
								onChange={(e) =>
									dispatch({
										type: "patch",
										patch: { priority: e.target.value as Task["priority"] },
									})
								}
								aria-label="Priority"
								className="surface-inset h-9 rounded-lg px-2.5 text-sm outline-none"
							>
								{PRIORITIES.map((p) => (
									<option key={p} value={p}>
										{PRIORITY_META[p].label}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<ReminderField
							dueDate={dueDate}
							value={reminder}
							onChange={(nextReminder) =>
								dispatch({
									type: "patch",
									patch: { reminder: nextReminder },
								})
							}
						/>
						<RecurrenceField
							value={recurrenceRule}
							onChange={(nextRecurrenceRule) =>
								dispatch({
									type: "patch",
									patch: { recurrenceRule: nextRecurrenceRule },
								})
							}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void handleSave()}
						disabled={saving}
						className="glow-button text-primary-foreground disabled:opacity-60"
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
