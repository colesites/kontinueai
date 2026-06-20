"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	Bot,
	CalendarDays,
	Columns3,
	Flag,
	List,
	ListChecks,
	Plus,
	SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	BUCKET_LABELS,
	type Bucket,
	bucketFor,
	PRIORITY_OPTIONS,
	type Task,
	type TaskView,
} from "../lib/task-shared";
import { DateTimePicker } from "./DateTimePicker";
import { PushNotificationBanner } from "./PushNotificationBanner";
import { RecurrenceField } from "./RecurrenceField";
import { ReminderField } from "./ReminderField";
import { TaskCalendar } from "./TaskCalendar";
import { TaskEditDialog } from "./TaskEditDialog";
import { TaskKanban } from "./TaskKanban";
import { TaskNotificationToggle } from "./TaskNotificationToggle";
import { TaskRow } from "./TaskRow";

const VIEWS: { id: TaskView; label: string; icon: typeof List }[] = [
	{ id: "list", label: "List", icon: List },
	{ id: "kanban", label: "Kanban", icon: Columns3 },
	{ id: "calendar", label: "Calendar", icon: CalendarDays },
];

export function TasksClient() {
	const tasks = useQuery(api.tasks.listTasks, {});
	const createTask = useMutation(api.tasks.createTask);
	const toggleComplete = useMutation(api.tasks.toggleTaskComplete);
	const deleteTask = useMutation(api.tasks.deleteTask);

	const [view, setView] = useState<TaskView>("list");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<Task["priority"]>("medium");
	const [due, setDue] = useState<number | null>(null);
	const [reminder, setReminder] = useState<number | null>(null);
	const [recurrenceRule, setRecurrenceRule] = useState<string | null>(null);
	const [isAgentTask, setIsAgentTask] = useState(false);
	const [aiInstruction, setAiInstruction] = useState("");
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [isAdding, setIsAdding] = useState(false);
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [editOpen, setEditOpen] = useState(false);

	const openEdit = (task: Task) => {
		setEditingTask(task);
		setEditOpen(true);
	};

	const grouped = useMemo(() => {
		const out: Record<Bucket, Task[]> = {
			overdue: [],
			today: [],
			upcoming: [],
			completed: [],
		};
		for (const task of tasks ?? []) out[bucketFor(task)].push(task);
		return out;
	}, [tasks]);

	const handleAdd = async () => {
		const trimmed = title.trim();
		if (!trimmed) return;
		if (reminder != null && due == null) {
			toast.error("Set a due date to add a reminder");
			return;
		}
		if (isAgentTask && due == null) {
			toast.error("Set a date/time for K-AI to run this task");
			return;
		}
		if (isAgentTask && !aiInstruction.trim()) {
			toast.error("Tell K-AI what to do for this task");
			return;
		}
		setIsAdding(true);
		try {
			await createTask({
				title: trimmed,
				description: description.trim() || undefined,
				priority,
				dueDate: due ?? undefined,
				reminderMinutesBefore: reminder ?? undefined,
				recurring: recurrenceRule != null,
				recurrenceRule: recurrenceRule ?? undefined,
				isAgentTask,
				aiInstruction: isAgentTask ? aiInstruction.trim() : undefined,
			});
			setTitle("");
			setDescription("");
			setPriority("medium");
			setDue(null);
			setReminder(null);
			setRecurrenceRule(null);
			setIsAgentTask(false);
			setAiInstruction("");
			setDetailsOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create task");
		} finally {
			setIsAdding(false);
		}
	};

	const order: Bucket[] = ["overdue", "today", "upcoming", "completed"];
	const totalOpen =
		grouped.overdue.length + grouped.today.length + grouped.upcoming.length;

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 py-6">
			<header className="mb-5 flex items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 shadow-[0_4px_18px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
						<ListChecks size={18} />
					</span>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
						<p className="text-xs text-muted-foreground">
							{tasks === undefined
								? "Loading…"
								: `${totalOpen} open · ${grouped.completed.length} completed`}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<TaskNotificationToggle />

					{/* View switcher */}
					<div className="surface-inset flex items-center gap-0.5 rounded-xl p-0.5">
						{VIEWS.map((v) => {
							const Icon = v.icon;
							return (
								<button
									key={v.id}
									type="button"
									onClick={() => setView(v.id)}
									aria-label={v.label}
									title={v.label}
									className={cn(
										"flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
										view === v.id
											? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<Icon size={14} />
									<span className="hidden sm:inline">{v.label}</span>
								</button>
							);
						})}
					</div>
				</div>
			</header>

			<PushNotificationBanner className="mb-4" />

			{/* Quick add */}
			<div className="surface-card mb-6 rounded-2xl p-2.5">
				<div className="flex items-center gap-2">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void handleAdd();
							}
						}}
						placeholder="Add a task…"
						className="min-w-[160px] flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
						maxLength={200}
					/>
					<button
						type="button"
						onClick={() => setDetailsOpen((o) => !o)}
						aria-label={detailsOpen ? "Hide details" : "Add details"}
						aria-expanded={detailsOpen}
						className={cn(
							"flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
							detailsOpen
								? "bg-foreground/10 text-foreground"
								: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
						)}
					>
						<SlidersHorizontal size={14} />
						<span className="hidden sm:inline">Details</span>
					</button>
					<Button
						onClick={() => void handleAdd()}
						disabled={isAdding || !title.trim()}
						size="icon"
						aria-label="Add task"
						className="glow-button shrink-0 rounded-full text-primary-foreground transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
					>
						<Plus size={16} />
					</Button>
				</div>

				{detailsOpen && (
					<div className="mt-2 space-y-2 border-t border-border/50 pt-2.5">
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Description (optional)"
							rows={2}
							maxLength={2000}
							className="resize-none text-sm"
						/>

						{/* AI task: let K-AI run an instruction at the scheduled time */}
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={isAgentTask}
								onChange={(e) => setIsAgentTask(e.target.checked)}
								className="size-4 accent-primary"
							/>
							<Bot size={14} className="text-primary" />
							<span>Run with K-AI at the scheduled time</span>
						</label>
						{isAgentTask && (
							<Textarea
								value={aiInstruction}
								onChange={(e) => setAiInstruction(e.target.value)}
								placeholder="What should K-AI do? e.g. “Summarize my unread email and list anything urgent.”"
								rows={2}
								maxLength={2000}
								className="resize-none text-sm"
							/>
						)}
						<div className="flex flex-wrap items-center gap-2">
							<DateTimePicker value={due} onChange={setDue} />
							<ReminderField
								dueDate={due}
								value={reminder}
								onChange={setReminder}
							/>
							<RecurrenceField
								value={recurrenceRule}
								onChange={setRecurrenceRule}
							/>
							<div className="relative">
								<Flag
									size={13}
									className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
								/>
								<select
									value={priority}
									onChange={(e) =>
										setPriority(e.target.value as Task["priority"])
									}
									aria-label="Priority"
									className="h-9 rounded-md border border-input bg-transparent pl-7 pr-2 text-sm text-muted-foreground"
								>
									{PRIORITY_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="flex-1">
				{tasks === undefined ? (
					<div className="flex items-center justify-center py-10">
						<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				) : tasks.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-foreground/15 px-4 py-12 text-center text-sm text-muted-foreground">
						No tasks yet. Add one above to get started.
					</div>
				) : view === "kanban" ? (
					<TaskKanban tasks={tasks} />
				) : view === "calendar" ? (
					<TaskCalendar tasks={tasks} />
				) : (
					<div className="space-y-6">
						{order.map((bucket) => {
							const items = grouped[bucket];
							if (items.length === 0) return null;
							return (
								<section key={bucket}>
									<h2 className="eyebrow mb-2 flex items-center gap-2 px-1">
										<span
											className={cn(bucket === "overdue" && "text-destructive")}
										>
											{BUCKET_LABELS[bucket]}
										</span>
										<span className="text-muted-foreground/60">
											{items.length}
										</span>
									</h2>
									<ul className="flex flex-col gap-1">
										{items.map((task) => (
											<TaskRow
												key={task._id}
												task={task}
												onEdit={() => openEdit(task)}
												onToggle={() =>
													void toggleComplete({ taskId: task._id })
												}
												onDelete={async () => {
													try {
														await deleteTask({ taskId: task._id });
													} catch (err) {
														toast.error(
															err instanceof Error
																? err.message
																: "Failed to delete task",
														);
													}
												}}
											/>
										))}
									</ul>
								</section>
							);
						})}
					</div>
				)}
			</div>

			<TaskEditDialog
				task={editingTask}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>
		</div>
	);
}
