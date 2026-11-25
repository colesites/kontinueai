"use client";

import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { KodeRemoteChat } from "./KodeRemoteChat";
import { KodeRemoteHome } from "./KodeRemoteHome";

const CONVEX_ID = /^[a-z0-9]{24,40}$/;

function param(value: string | string[] | undefined): string {
	return decodeURIComponent(
		Array.isArray(value) ? (value[0] ?? "") : (value ?? ""),
	);
}

export function KodeRemoteDeviceRoute() {
	const params = useParams<{ deviceId: string }>();
	return <KodeRemoteHome deviceId={param(params.deviceId)} />;
}

export function KodeRemoteChatRoute() {
	const params = useParams<{ deviceId: string; chatId: string }>();
	const deviceId = param(params.deviceId);
	const chatId = param(params.chatId);
	// A mistyped link would fail Convex's id check and crash the view.
	if (!CONVEX_ID.test(chatId)) return <KodeRemoteHome deviceId={deviceId} />;
	// A new chat id means a new thread view (its own composer and answers).
	return (
		<KodeRemoteChat
			key={chatId}
			deviceId={deviceId}
			chatId={chatId as Id<"kodeChats">}
		/>
	);
}
