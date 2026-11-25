"use client";

import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
	deviceSeenLabel,
	isDeviceOnline,
	type KodeRemoteStep,
	parseKodeRemoteMessage,
} from "@repo/core/kode-remote";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	Check,
	ChevronDown,
	Clock,
	LoaderCircle,
	Square,
	TriangleAlert,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageContent } from "../../chat/components/MessageContent";
import { errorMessage, useNow, useWatchChat } from "../lib/hooks";
import { OnlineDot, RemoteHeader, RunBadge } from "./RemoteBits";
import { RemoteComposer } from "./RemoteComposer";
import { RemotePendingCard } from "./RemotePendingCard";

function StepList({
	steps,
	live,
}: {
	steps: KodeRemoteStep[];
	live?: boolean;
}) {
	const [open, setOpen] = useState(Boolean(live));
	if (steps.length === 0) return null;
	const shown = open ? steps : [];
	return (
		<div className="mb-2">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronDown
					className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
				/>
				{steps.length} step{steps.length === 1 ? "" : "s"}
			</button>
			{shown.length > 0 ? (
				<ul className="mt-1.5 space-y-1 border-l border-foreground/10 pl-3">
					{shown.map((step) => (
						<li key={step.id} className="flex items-center gap-2 text-xs">
							{step.state === "running" ? (
								<LoaderCircle className="size-3 shrink-0 animate-spin text-primary" />
							) : step.state === "error" || step.state === "rejected" ? (
								<X className="size-3 shrink-0 text-rose-500" />
							) : step.state.startsWith("pending") ? (
								<Clock className="size-3 shrink-0 text-amber-500" />
							) : (
								<Check className="size-3 shrink-0 text-emerald-500" />
							)}
							<span className="truncate text-muted-foreground">
								{step.label}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function UserBubble({
	text,
	waiting,
	onCancel,
}: {
	text: string;
	waiting?: boolean;
	onCancel?: () => void;
}) {
	return (
		<div className="flex justify-end">
			<div
				className={cn(
					"max-w-[85%] rounded-3xl bg-foreground/6 px-4 py-2.5 text-sm",
					waiting && "opacity-70",
				)}
			>
				<p className="whitespace-pre-wrap break-words">{text}</p>
				{waiting ? (
					<p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<Clock className="size-3" />
						Waiting for your computer
						{onCancel ? (
							<button
								type="button"
								onClick={onCancel}
								className="ml-1 underline-offset-2 hover:underline"
							>
								Cancel
							</button>
						) : null}
					</p>
				) : null}
			</div>
		</div>
	);
}

/** /kode/[deviceId]/[chatId]: a thread on your computer, live. */
export function KodeRemoteChat({
	deviceId,
	chatId,
}: {
	deviceId: string;
	chatId: Id<"kodeChats">;
}) {
	const live = useQuery(api.kodeRemote.chatLive, { deviceId, chatId });
	const overview = useQuery(api.kodeRemote.deviceOverview, { deviceId });
	const messages = useQuery(api.kode.getMessages, { chatId });
	const sendPrompt = useMutation(api.kodeRemote.sendPrompt);
	const respond = useMutation(api.kodeRemote.respond);
	const stopRun = useMutation(api.kodeRemote.stopRun);
	const cancelQueued = useMutation(api.kodeRemote.cancelQueued);
	const now = useNow(10_000);
	useWatchChat(deviceId, chatId);

	const bottom = useRef<HTMLDivElement>(null);
	const run = live?.run ?? null;
	const busy = run !== null && run.status !== "idle";
	const lastSaved = messages?.at(-1)?.createdAt ?? 0;
	const parsed = useMemo(
		() =>
			(messages ?? []).map((message) => ({
				message,
				...parseKodeRemoteMessage(message.content),
			})),
		[messages],
	);

	// Follow new content to the bottom (the values are triggers, not inputs).
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll triggers
	useEffect(() => {
		bottom.current?.scrollIntoView({ block: "end" });
	}, [parsed.length, run?.text, run?.pending.length, live?.queued.length]);

	if (live === undefined || overview === undefined) {
		return (
			<div className="mx-auto w-full max-w-3xl px-5 py-6">
				<div className="surface-card h-64 animate-pulse rounded-2xl" />
			</div>
		);
	}
	if (live === null || overview === null) {
		return (
			<div className="mx-auto w-full max-w-3xl px-5 py-6">
				<RemoteHeader
					title="Thread not found"
					back={{ href: "/kode", label: "Kode" }}
				/>
			</div>
		);
	}

	const { device } = overview;
	const online = device.enabled && isDeviceOnline(device.lastSeenAt, now);
	const showError =
		live.lastError &&
		live.lastError.at > lastSaved &&
		now - live.lastError.at < 15 * 60_000;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 pt-6">
			<RemoteHeader
				title={live.title}
				back={{ href: "/kode", label: "Kode" }}
				subtitle={
					<span className="flex items-center gap-1.5">
						<OnlineDot online={online} />
						{device.name} ·{" "}
						{device.enabled
							? deviceSeenLabel(device.lastSeenAt, now)
							: "remote control off"}
					</span>
				}
				actions={
					busy ? (
						<div className="flex items-center gap-2">
							<RunBadge status={run.status} />
							<button
								type="button"
								onClick={() =>
									void stopRun({ deviceId, chatId }).catch((error) =>
										toast.error(errorMessage(error, "Couldn't stop it.")),
									)
								}
								className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/6 px-3 text-xs font-medium transition-colors hover:bg-foreground/10"
							>
								<Square className="size-3 fill-current" />
								Stop
							</button>
						</div>
					) : null
				}
			/>

			<div className="flex-1 space-y-5 pb-6">
				{messages === undefined ? (
					<div className="flex justify-center py-10">
						<LoaderCircle className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : null}
				{parsed.map(({ message, text, steps }) =>
					message.role === "user" ? (
						<UserBubble key={message._id} text={text} />
					) : message.role === "assistant" ? (
						<div key={message._id} className="text-sm leading-relaxed">
							<StepList steps={steps} />
							{text ? <MessageContent content={text} /> : null}
						</div>
					) : null,
				)}

				{live.queued.map((item) => (
					<UserBubble
						key={item.id}
						text={item.text}
						waiting
						onCancel={() => void cancelQueued({ commandId: item.id })}
					/>
				))}

				{busy ? (
					<div className="text-sm leading-relaxed">
						<StepList steps={run.steps} live />
						{run.text ? (
							<MessageContent content={run.text} isStreaming />
						) : (
							<p className="flex items-center gap-2 text-muted-foreground">
								<LoaderCircle className="size-4 animate-spin" />
								{run.steps.at(-1)?.label ?? "Working on your computer…"}
							</p>
						)}
					</div>
				) : null}

				{run?.pending.map((pending) => (
					<RemotePendingCard
						key={pending.id}
						pending={pending}
						onApprove={async (approved) => {
							try {
								await respond({
									deviceId,
									chatId,
									stepId: pending.id,
									approved,
								});
							} catch (error) {
								toast.error(errorMessage(error, "Couldn't send that."));
							}
						}}
						onAnswer={async (values) => {
							try {
								await respond({ deviceId, chatId, stepId: pending.id, values });
							} catch (error) {
								toast.error(errorMessage(error, "Couldn't send that."));
							}
						}}
					/>
				))}

				{showError ? (
					<p className="flex items-start gap-2 rounded-2xl bg-rose-500/8 px-4 py-3 text-xs text-rose-600 dark:text-rose-400">
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						{live.lastError?.message}
					</p>
				) : null}
				<div ref={bottom} />
			</div>

			<div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-5 pt-3">
				<RemoteComposer
					models={device.models}
					defaultModelId={device.defaultModelId}
					disabled={!device.enabled}
					placeholder={
						busy
							? "Send a follow-up (it goes out when this turn ends)…"
							: "Reply to Kode…"
					}
					note={
						!device.enabled
							? "Remote control is off on this computer."
							: online
								? null
								: "This computer looks offline. Your message waits up to 10 minutes for it."
					}
					onSend={async ({ text, modelId, mode }) => {
						try {
							await sendPrompt({ deviceId, chatId, text, modelId, mode });
							return true;
						} catch (error) {
							toast.error(
								errorMessage(error, "Couldn't send that to your computer."),
							);
							return false;
						}
					}}
				/>
			</div>
		</div>
	);
}
