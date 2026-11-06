import { runKaiWebSearch } from "../../chat/lib/web-search/pipeline";
import { getAuthContext } from "../../chat/lib/route-input";
import { jsonError } from "../lib/gateway-stream";

// Web search for the Kode agent's `web_search` tool. Same pipeline as K-AI
// (Tavily → Serper, 24h cache, monthly search quota); returns text + sources.

export async function POST(request: Request) {
	const { userId, getToken } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to search the web.");
	const convexToken = (await getToken?.({ template: "convex" })) ?? undefined;
	if (!convexToken) return jsonError(401, "unauthorized", "Your session expired. Sign in again.");

	let query = "";
	try {
		query = String(((await request.json()) as { query?: unknown }).query ?? "").slice(0, 400);
	} catch {
		// handled below
	}
	if (!query.trim()) return jsonError(400, "bad_request", "Missing search query.");

	const result = await runKaiWebSearch({ query, convexToken, trigger: "auto" });
	if (!result) return Response.json({ results: "", sources: [] });
	if (result.limited) {
		return jsonError(429, "search_limit", "You've used this month's web searches.");
	}
	return Response.json({ results: result.contextText, sources: result.sources });
}
