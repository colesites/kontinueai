"use client";

import {
	buildRemoteAnswer,
	type KodeRemoteDraftAnswer,
	type KodeRemotePending,
} from "@repo/core/kode-remote";
import { cn } from "@repo/ui/lib/utils";
import {
	FilePen,
	LoaderCircle,
	MessageCircleQuestion,
	Terminal,
} from "lucide-react";
import { useState } from "react";

const chip =
	"rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50";

/** What a run on the computer is waiting on: allow/deny, or an answer. */
export function RemotePendingCard({
	pending,
	onApprove,
	onAnswer,
}: {
	pending: KodeRemotePending;
	onApprove: (approved: boolean) => Promise<void>;
	onAnswer: (values: string[]) => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	const [answers, setAnswers] = useState<Record<number, KodeRemoteDraftAnswer>>(
		{},
	);
	const run = async (task: () => Promise<void>) => {
		setBusy(true);
		try {
			await task();
		} finally {
			setBusy(false);
		}
	};

	if (pending.kind === "approval") {
		const isCommand = pending.title.includes("command");
		const Icon = isCommand ? Terminal : FilePen;
		return (
			<div className="surface-card rounded-2xl border border-amber-500/25 p-4">
				<p className="flex items-center gap-2 text-sm font-medium">
					<Icon className="size-4 text-amber-500" />
					{pending.title}
				</p>
				{pending.detail ? (
					<pre className="mt-2.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-foreground/5 px-3 py-2 font-mono text-xs">
						{pending.detail}
					</pre>
				) : null}
				<div className="mt-3 flex gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={() => void run(() => onApprove(false))}
						className="h-9 flex-1 rounded-full bg-foreground/6 text-sm font-medium transition-colors hover:bg-foreground/10 disabled:opacity-50"
					>
						Deny
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => void run(() => onApprove(true))}
						className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
						Allow
					</button>
				</div>
			</div>
		);
	}

	const questions = pending.questions ?? [];
	const values = buildRemoteAnswer(questions, answers);
	const set = (index: number, patch: Partial<KodeRemoteDraftAnswer>) =>
		setAnswers((current) => ({
			...current,
			[index]: { ...(current[index] ?? { picked: [], text: "" }), ...patch },
		}));

	return (
		<div className="surface-card rounded-2xl border border-primary/25 p-4">
			<div className="space-y-4">
				{questions.map((question, index) => {
					const answer = answers[index] ?? { picked: [], text: "" };
					const multi = question.kind === "multi";
					const options =
						question.kind === "confirm" && question.options.length === 0
							? [
									{ value: "yes", label: "Yes" },
									{ value: "no", label: "No" },
								]
							: question.options;
					return (
						// Questions are a fixed list for this card; the index is their identity.
						// biome-ignore lint/suspicious/noArrayIndexKey: answers are keyed by position
						<div key={`${question.question}-${index}`}>
							<p className="flex items-start gap-2 text-sm font-medium">
								<MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
								{question.question}
							</p>
							{question.kind !== "text" && options.length > 0 ? (
								<div className="mt-2.5 flex flex-wrap gap-1.5">
									{options.map((option) => {
										const picked = answer.picked.includes(option.value);
										return (
											<button
												key={option.value}
												type="button"
												title={option.description}
												disabled={busy}
												onClick={() =>
													set(index, {
														picked: multi
															? picked
																? answer.picked.filter(
																		(v) => v !== option.value,
																	)
																: [...answer.picked, option.value]
															: [option.value],
													})
												}
												className={cn(
													chip,
													picked
														? "border-primary bg-primary text-primary-foreground"
														: "border-foreground/10 hover:bg-foreground/5",
												)}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							) : null}
							{question.kind === "text" ||
							options.length === 0 ||
							question.allowOther ? (
								<input
									value={answer.text}
									disabled={busy}
									onChange={(event) => set(index, { text: event.target.value })}
									placeholder={
										question.kind === "text" || options.length === 0
											? (question.placeholder ?? "Your answer")
											: "Something else"
									}
									className="mt-2.5 h-9 w-full rounded-full bg-foreground/5 px-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
								/>
							) : null}
						</div>
					);
				})}
			</div>
			<button
				type="button"
				disabled={busy || values.length === 0}
				onClick={() => void run(() => onAnswer(values))}
				className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
			>
				{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
				Send answer
			</button>
		</div>
	);
}
