"use client";

import type { KodeRemoteRunStatus } from "@repo/core/kode-remote";
import { cn } from "@repo/ui/lib/utils";
import {
	Laptop,
	LoaderCircle,
	MessageCircleQuestion,
	Monitor,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function DeviceIcon({
	platform,
	className,
}: {
	platform: string;
	className?: string;
}) {
	const Icon = platform === "macos" ? Laptop : Monitor;
	return <Icon className={cn("size-4", className)} />;
}

/** Green when online, grey when not. */
export function OnlineDot({ online }: { online: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				"inline-block size-2 shrink-0 rounded-full",
				online
					? "bg-emerald-500 shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-emerald-500)_22%,transparent)]"
					: "bg-muted-foreground/40",
			)}
		/>
	);
}

export function RunBadge({ status }: { status: KodeRemoteRunStatus }) {
	if (status === "idle") return null;
	if (status === "awaiting") {
		return (
			<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
				<MessageCircleQuestion className="size-3" />
				Needs you
			</span>
		);
	}
	return (
		<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
			<LoaderCircle className="size-3 animate-spin" />
			Running
		</span>
	);
}

/** Page header shared by the remote control screens. */
export function RemoteHeader({
	title,
	subtitle,
	back,
	actions,
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	back?: { href: string; label: string };
	actions?: ReactNode;
}) {
	return (
		<header className="mb-6">
			{back ? (
				<Link
					href={back.href}
					className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					← {back.label}
				</Link>
			) : null}
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="min-w-0">
						<h1 className="truncate text-lg font-semibold tracking-tight">
							{title}
						</h1>
						{subtitle ? (
							<div className="truncate text-xs text-muted-foreground">
								{subtitle}
							</div>
						) : null}
					</div>
				</div>
				{actions}
			</div>
		</header>
	);
}
