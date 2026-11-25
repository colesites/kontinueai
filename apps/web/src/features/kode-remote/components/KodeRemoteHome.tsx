"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { deviceSeenLabel, isDeviceOnline } from "@repo/core/kode-remote";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Folder, MessageSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorMessage, useNow } from "../lib/hooks";
import { DeviceIcon, OnlineDot, RunBadge } from "./RemoteBits";
import { RemoteComposer } from "./RemoteComposer";

const DOWNLOAD_URL = "https://kontinueai.com/download";
const COMPUTER_KEY = "kode-remote-computer";
const NO_PROJECT = "__none";

function timeAgo(at: number, now: number): string {
	const minutes = Math.floor((now - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

/** Centered state with the app icon, like Codex's "Unable to connect". */
function CenterState({
	title,
	body,
	action,
}: {
	title: string;
	body: string;
	action?: { label: string; href: string };
}) {
	return (
		<div className="flex flex-col items-center px-8 pt-24 text-center">
			<Image
				src="/kontinueai-app-icon.png"
				alt=""
				width={64}
				height={64}
				className="rounded-2xl"
			/>
			<p className="mt-5 text-base font-semibold">{title}</p>
			<p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
			{action ? (
				<a
					href={action.href}
					target="_blank"
					rel="noreferrer"
					className="mt-5 rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-foreground/6"
				>
					{action.label}
				</a>
			) : null}
		</div>
	);
}

/**
 * /kode (and /kode/[deviceId], the desktop's QR link): Kode on your computer,
 * one screen like ChatGPT's Codex: the computer as a chip you can switch, its
 * threads, and "Ask Kode" at the bottom.
 */
export function KodeRemoteHome({ deviceId }: { deviceId?: string }) {
	const router = useRouter();
	const now = useNow();
	const devices = useQuery(api.kodeRemote.listDevices, {});
	const sendPrompt = useMutation(api.kodeRemote.sendPrompt);
	const [picked, setPicked] = useState<string | null>(deviceId ?? null);
	const [projectKey, setProjectKey] = useState(NO_PROJECT);

	// The computer you used last, unless the link named one.
	useEffect(() => {
		if (deviceId) return;
		const saved = window.localStorage.getItem(COMPUTER_KEY);
		if (saved) setPicked(saved);
	}, [deviceId]);
	const device =
		devices?.find((d) => d.deviceId === picked) ??
		devices?.find((d) => d.enabled && isDeviceOnline(d.lastSeenAt, now)) ??
		devices?.[0] ??
		null;
	const pick = (id: string) => {
		setPicked(id);
		setProjectKey(NO_PROJECT);
		window.localStorage.setItem(COMPUTER_KEY, id);
	};

	const overview = useQuery(
		api.kodeRemote.deviceOverview,
		device ? { deviceId: device.deviceId } : "skip",
	);
	const online = Boolean(
		device?.enabled && isDeviceOnline(device.lastSeenAt, now),
	);

	const groups = useMemo(() => {
		if (!overview) return [];
		const byProject = new Map<string | null, typeof overview.chats>();
		for (const chat of overview.chats) {
			const key = overview.projects.some((p) => p.key === chat.projectKey)
				? chat.projectKey
				: null;
			byProject.set(key, [...(byProject.get(key) ?? []), chat]);
		}
		const rows = overview.projects
			.map((project) => ({
				key: project.key,
				name: project.name,
				chats: byProject.get(project.key) ?? [],
			}))
			.filter((group) => group.chats.length > 0);
		const loose = byProject.get(null) ?? [];
		if (loose.length > 0)
			rows.push({ key: NO_PROJECT, name: "Other threads", chats: loose });
		return rows;
	}, [overview]);

	const threadHref = (chatId: string) =>
		device ? `/kode/${encodeURIComponent(device.deviceId)}/${chatId}` : "/kode";

	let body: React.ReactNode;
	if (devices === undefined) {
		body = (
			<div className="space-y-2 pt-4">
				<div className="h-11 animate-pulse rounded-xl bg-foreground/5" />
				<div className="h-11 animate-pulse rounded-xl bg-foreground/5" />
			</div>
		);
	} else if (!device) {
		body = (
			<CenterState
				title="Connect your computer"
				body="Open Kode on your Mac or PC, signed in with this account, and turn on Remote control in its sidebar."
				action={{ label: "Get Kode for desktop", href: DOWNLOAD_URL }}
			/>
		);
	} else if (!device.enabled) {
		body = (
			<CenterState
				title="Remote control is off"
				body={`Turn it on in Kode on ${device.name}: click Remote control in the sidebar.`}
			/>
		);
	} else if (!online && (overview?.chats.length ?? 0) === 0) {
		body = (
			<CenterState
				title="Unable to connect"
				body={`${deviceSeenLabel(device.lastSeenAt, now)}. Open Kode on ${device.name} and keep it awake.`}
			/>
		);
	} else if (overview === undefined) {
		body = (
			<div className="space-y-2 pt-4">
				<div className="h-11 animate-pulse rounded-xl bg-foreground/5" />
			</div>
		);
	} else if (groups.length === 0) {
		body = (
			<CenterState
				title={`Kode on ${device.name}`}
				body="Ask Kode to build, fix or explain something. It runs on your computer."
			/>
		);
	} else {
		body = (
			<div className="space-y-6 pt-2">
				{groups.map((group) => (
					<div key={group.key}>
						<p className="mb-1 flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
							{group.key === NO_PROJECT ? (
								<MessageSquare className="size-3.5" />
							) : (
								<Folder className="size-3.5 text-primary" />
							)}
							{group.name}
						</p>
						{group.chats.slice(0, 30).map((chat) => (
							<Link
								key={chat.chatId}
								href={threadHref(chat.chatId)}
								className="flex items-center gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-foreground/5"
							>
								<span className="min-w-0 flex-1 truncate text-sm">
									{chat.title}
								</span>
								<RunBadge status={chat.status} />
								<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
									{timeAgo(chat.updatedAt, now)}
								</span>
							</Link>
						))}
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-5 pt-6">
			{device ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={(devices?.length ?? 0) < 2}
						className="flex w-fit items-center gap-2 rounded-full py-1.5 pr-2 text-sm font-medium outline-none disabled:cursor-default"
					>
						<OnlineDot online={online} />
						<DeviceIcon platform={device.platform} />
						<span className="max-w-[260px] truncate">{device.name}</span>
						{(devices?.length ?? 0) > 1 ? (
							<ChevronDown className="size-3.5 text-muted-foreground" />
						) : null}
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-64">
						{(devices ?? []).map((item) => (
							<DropdownMenuItem
								key={item.deviceId}
								onSelect={() => pick(item.deviceId)}
								className="gap-2"
							>
								<DeviceIcon platform={item.platform} />
								<span className="min-w-0 flex-1 truncate">
									{item.name}
									<span className="text-muted-foreground">
										{" "}
										·{" "}
										{item.enabled
											? deviceSeenLabel(item.lastSeenAt, now)
											: "Off"}
									</span>
								</span>
								{item.deviceId === device.deviceId ? (
									<Check className="size-3.5 text-primary" />
								) : null}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}

			<div className="flex-1 pb-6">{body}</div>

			{device?.enabled && overview ? (
				<div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-5 pt-3">
					<RemoteComposer
						models={overview.device.models}
						defaultModelId={overview.device.defaultModelId}
						placeholder="Ask Kode"
						note={
							online
								? null
								: `${device.name} is offline. Your message waits up to 10 minutes for it.`
						}
						leading={
							overview.projects.length > 0 ? (
								<Select value={projectKey} onValueChange={setProjectKey}>
									<SelectTrigger
										className="h-8 w-auto max-w-[200px] gap-1.5 rounded-full border-0 bg-foreground/5 px-3 text-xs shadow-none"
										aria-label="Project"
									>
										<Folder className="size-3.5 text-primary" />
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_PROJECT}>No project</SelectItem>
										{overview.projects.map((project) => (
											<SelectItem key={project.key} value={project.key}>
												{project.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : null
						}
						onSend={async ({ text, modelId, mode }) => {
							try {
								const { chatId } = await sendPrompt({
									deviceId: device.deviceId,
									projectKey: projectKey === NO_PROJECT ? null : projectKey,
									text,
									modelId,
									mode,
								});
								router.push(threadHref(chatId));
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
			) : null}
		</div>
	);
}
