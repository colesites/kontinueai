"use client";

import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { KODE_REMOTE_WATCH_REFRESH_MS } from "@repo/core/kode-remote";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";

/** A clock that ticks, so "Online" / "Seen 2m ago" stays current. */
export function useNow(ms = 15_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), ms);
		return () => window.clearInterval(timer);
	}, [ms]);
	return now;
}

/**
 * Tell the computer this chat is open here, so it streams the reply. Refreshed
 * while the tab is visible; it lapses on its own when you leave.
 */
export function useWatchChat(deviceId: string, chatId: Id<"kodeChats">) {
	const watch = useMutation(api.kodeRemote.watchChat);
	useEffect(() => {
		const ping = () => {
			if (document.visibilityState !== "visible") return;
			void watch({ deviceId, chatId }).catch(() => undefined);
		};
		ping();
		const timer = window.setInterval(ping, KODE_REMOTE_WATCH_REFRESH_MS);
		document.addEventListener("visibilitychange", ping);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", ping);
		};
	}, [watch, deviceId, chatId]);
}

export function errorMessage(error: unknown, fallback: string): string {
	if (error && typeof error === "object" && "data" in error) {
		const data = (error as { data?: unknown }).data;
		if (data && typeof data === "object" && "message" in data) {
			const message = (data as { message?: unknown }).message;
			if (typeof message === "string") return message;
		}
	}
	return error instanceof Error ? error.message : fallback;
}
