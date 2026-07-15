import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { fetchQuery } from "convex/nextjs";
import { getAuthContext } from "../../chat/lib/route-input";
import { getRealtimeToken } from "../realtime-gateway";

export const maxDuration = 30;

export async function POST(request: Request) {
	try {
		const { userId, getToken } = await getAuthContext();
		if (!userId) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}

		const sessionId = new URL(request.url).searchParams.get("sessionId");
		if (!sessionId) {
			return Response.json({ error: "Missing voice session" }, { status: 400 });
		}

		const convexToken = (await getToken?.({ template: "convex" })) ?? null;
		if (!convexToken) {
			return Response.json(
				{ error: "Your session could not be verified." },
				{ status: 401 },
			);
		}

		const setup = await fetchQuery(
			convexApi.realtimeVoice.getSessionSetup,
			{ sessionId: sessionId as Id<"realtimeVoiceSessions"> },
			{ token: convexToken },
		);
		if (!setup) {
			return Response.json(
				{ error: "This voice session is no longer active." },
				{ status: 403 },
			);
		}

		const { token, url } = await getRealtimeToken({
			model: setup.model,
			expiresAfterSeconds: 60,
		});

		return Response.json(
			{ token, url, tools: [] },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		console.error("[realtime] token mint failed", error);
		return Response.json(
			{ error: "Live voice could not connect. Please try again." },
			{ status: 500 },
		);
	}
}
