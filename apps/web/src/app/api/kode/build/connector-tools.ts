import type { ToolSet } from "ai";
import {
	type ConnectorTokens,
	ownerConnectorTokens,
	userConnectorTokens,
} from "../../chat/lib/connector-tokens";
import { buildAutonomousConnectorTools } from "../../chat/lib/tools-config";

const READ_ONLY_ACTIONS: Record<string, ReadonlySet<string>> = {
	github: new Set([
		"list_repos",
		"get_repo",
		"list_issues",
		"list_pull_requests",
		"list_branches",
		"list_commits",
		"get_file",
		"search_code",
	]),
	notion: new Set(["search", "read", "get_database", "query_database"]),
	vercel: new Set(["list_deployments"]),
	gmail: new Set(["search", "read"]),
	google_calendar: new Set(["list"]),
	google_drive: new Set(["search", "read"]),
	google_sheets: new Set([
		"list_spreadsheets",
		"get_spreadsheet",
		"read_range",
	]),
	todoist: new Set(["list_tasks", "list_projects"]),
};

type ToolExecutor = (
	input: Record<string, unknown>,
	options: unknown,
) => Promise<unknown> | unknown;

function asReadOnlyTool(
	name: string,
	source: ToolSet[string],
): ToolSet[string] {
	const allowedActions = READ_ONLY_ACTIONS[name];
	if (!allowedActions || !("execute" in source) || !source.execute)
		return source;
	const execute = source.execute as unknown as ToolExecutor;

	return {
		...source,
		execute: async (input: Record<string, unknown>, options: unknown) => {
			const action = typeof input.action === "string" ? input.action : "";
			if (!allowedActions.has(action)) {
				return {
					connected: true,
					error: "Kode connector access is read-only during app generation.",
				};
			}
			return await execute(input, options);
		},
	} as ToolSet[string];
}

function buildReadOnlyKodeTools(tokens: ConnectorTokens): ToolSet {
	const source = buildAutonomousConnectorTools(tokens, null);
	const tools: ToolSet = {};
	for (const [name, connectorTool] of Object.entries(source)) {
		if (name === "get_current_time") continue;
		tools[name] = asReadOnlyTool(name, connectorTool);
	}
	return tools;
}

export function buildKodeConnectorTools(convexToken: string): ToolSet {
	return buildReadOnlyKodeTools(userConnectorTokens(convexToken));
}

export function buildKodeConnectorToolsForOwner(
	ownerId: string,
	secret: string,
): ToolSet {
	return buildReadOnlyKodeTools(ownerConnectorTokens(ownerId, secret));
}
