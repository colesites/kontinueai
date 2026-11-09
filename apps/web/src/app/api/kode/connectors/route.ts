import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { asSchema, type ToolSet } from "ai";
import { fetchQuery } from "convex/nextjs";
import { getAuthContext } from "../../chat/lib/route-input";
import { userConnectorTokens } from "../../chat/lib/connector-tokens";
import { buildAutonomousConnectorTools } from "../../chat/lib/tools-config";
import { jsonError } from "../lib/gateway-stream";

// Connected web apps (GitHub, Gmail, Notion, …) as tools for Kode on the
// desktop. The same tool code as the Kontinue chat runs here, on the server,
// so OAuth tokens never leave it.
//
//   POST { action: "list" }                 → tool definitions (connected apps only)
//   POST { action: "call", name, args }     → { result } as text

export const maxDuration = 120;

const MAX_RESULT_CHARS = 24_000;

type Body =
	| { action: "list" }
	| { action: "call"; name?: string; args?: Record<string, unknown> };

async function connectedTools(convexToken: string): Promise<ToolSet> {
	const rows = await fetchQuery(convexApi.connectors.listConnectors, {}, { token: convexToken });
	const connected = new Set(rows.filter((row) => row.connected).map((row) => row.provider));
	if (connected.has("google_drive")) connected.add("google_sheets");
	const all = buildAutonomousConnectorTools(userConnectorTokens(convexToken), null);
	return Object.fromEntries(Object.entries(all).filter(([name]) => connected.has(name)));
}

export async function POST(request: Request) {
	const { userId, getToken } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to use connectors.");
	const convexToken = (await getToken?.({ template: "convex" })) ?? undefined;
	if (!convexToken) return jsonError(401, "unauthorized", "Your session expired. Sign in again.");

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return jsonError(400, "bad_request", "Invalid request body.");
	}

	const tools = await connectedTools(convexToken);

	if (body.action === "list") {
		const definitions = await Promise.all(
			Object.entries(tools).map(async ([name, tool]) => ({
				name,
				description: tool.description ?? `Use ${name}`,
				parameters: tool.inputSchema ? await asSchema(tool.inputSchema).jsonSchema : { type: "object" },
			})),
		);
		return Response.json({ tools: definitions });
	}

	if (body.action === "call") {
		const tool = body.name ? tools[body.name] : undefined;
		if (!tool?.execute) {
			return jsonError(404, "not_connected", `${body.name ?? "That app"} isn't connected. Connect it in Settings → Customize.`);
		}
		try {
			const output = await tool.execute(body.args ?? {}, {
				toolCallId: `kode-${Date.now()}`,
				messages: [],
			});
			const text = typeof output === "string" ? output : JSON.stringify(output);
			return Response.json({
				result: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : text,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return Response.json({ result: `Error: ${message}`, isError: true });
		}
	}

	return jsonError(400, "bad_request", "Unknown action.");
}
