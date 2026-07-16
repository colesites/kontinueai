import { tool } from "ai";
import { z } from "zod";

const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

const GOOGLE_SHEETS_ACTIONS = [
	"list_spreadsheets",
	"get_spreadsheet",
	"read_range",
	"create_spreadsheet",
	"rename_spreadsheet",
	"write_range",
	"append_rows",
	"clear_range",
	"add_sheet",
	"rename_sheet",
	"duplicate_sheet",
	"delete_sheet",
	"insert_rows",
	"delete_rows",
	"format_range",
] as const;

const cellValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

export const googleSheetsInputSchema = z.object({
	action: z
		.enum(GOOGLE_SHEETS_ACTIONS)
		.describe("The Google Sheets operation."),
	spreadsheetId: z
		.string()
		.optional()
		.describe(
			"Spreadsheet ID or full Google Sheets URL. Required for every action except list_spreadsheets and create_spreadsheet.",
		),
	query: z
		.string()
		.max(200)
		.optional()
		.describe(
			"For list_spreadsheets: optional text to match in spreadsheet names.",
		),
	maxResults: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe(
			"For list_spreadsheets: result limit, default 10 and maximum 50.",
		),
	range: z
		.string()
		.max(300)
		.optional()
		.describe(
			"A1 notation such as Sheet1!A1:D20. Required for read_range, write_range, append_rows, clear_range and format_range.",
		),
	values: z
		.array(z.array(cellValueSchema).max(100))
		.max(500)
		.optional()
		.describe(
			"Two-dimensional row array for write_range or append_rows. Strings beginning with = are formulas when valueInputOption is USER_ENTERED.",
		),
	valueInputOption: z
		.enum(["RAW", "USER_ENTERED"])
		.optional()
		.describe(
			"How Google interprets written values. Defaults to USER_ENTERED so formulas, dates and numbers behave like the Sheets UI.",
		),
	valueRenderOption: z
		.enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"])
		.optional()
		.describe("For read_range: how values should be returned."),
	title: z
		.string()
		.min(1)
		.max(100)
		.optional()
		.describe(
			"Spreadsheet title for create_spreadsheet/rename_spreadsheet, or tab title for add_sheet/duplicate_sheet.",
		),
	sheetTitles: z
		.array(z.string().min(1).max(100))
		.max(20)
		.optional()
		.describe("For create_spreadsheet: optional initial tab names."),
	sheetId: z
		.number()
		.int()
		.min(0)
		.optional()
		.describe(
			"Numeric tab ID from get_spreadsheet. Required for rename_sheet, duplicate_sheet, delete_sheet, insert_rows and delete_rows.",
		),
	newTitle: z
		.string()
		.min(1)
		.max(100)
		.optional()
		.describe("New tab title for rename_sheet."),
	rowCount: z
		.number()
		.int()
		.min(1)
		.max(10_000)
		.optional()
		.describe(
			"For add_sheet: initial row count. For insert_rows/delete_rows: number of rows.",
		),
	columnCount: z
		.number()
		.int()
		.min(1)
		.max(1_000)
		.optional()
		.describe("For add_sheet: initial column count."),
	startRow: z
		.number()
		.int()
		.min(1)
		.optional()
		.describe(
			"For insert_rows/delete_rows: first row number, using 1-based Sheets numbering.",
		),
	backgroundColor: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional()
		.describe("For format_range: background color as a six-digit hex value."),
	textColor: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional()
		.describe("For format_range: text color as a six-digit hex value."),
	bold: z
		.boolean()
		.optional()
		.describe("For format_range: set or remove bold."),
	italic: z
		.boolean()
		.optional()
		.describe("For format_range: set or remove italic."),
	horizontalAlignment: z
		.enum(["LEFT", "CENTER", "RIGHT"])
		.optional()
		.describe("For format_range: horizontal cell alignment."),
	numberFormatType: z
		.enum([
			"NUMBER",
			"PERCENT",
			"CURRENCY",
			"DATE",
			"TIME",
			"DATE_TIME",
			"TEXT",
		])
		.optional()
		.describe("For format_range: number format category."),
	numberFormatPattern: z
		.string()
		.max(100)
		.optional()
		.describe("For format_range: Google Sheets number/date format pattern."),
});

export type GoogleSheetsInput = z.infer<typeof googleSheetsInputSchema>;

type Fetcher = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type GoogleSheetsDependencies = {
	getAccessToken(): Promise<{ accessToken: string } | { error: string }>;
	apiError(response: Response, label: string): Promise<string>;
	fetch?: Fetcher;
};

type SheetProperties = {
	sheetId: number;
	title: string;
	index?: number;
	gridProperties?: {
		rowCount?: number;
		columnCount?: number;
		frozenRowCount?: number;
		frozenColumnCount?: number;
	};
};

type SpreadsheetMetadata = {
	spreadsheetId: string;
	spreadsheetUrl?: string;
	properties?: { title?: string; locale?: string; timeZone?: string };
	sheets?: Array<{ properties?: SheetProperties }>;
};

export function normalizeSpreadsheetId(
	value: string | undefined,
): string | null {
	const input = value?.trim();
	if (!input) return null;
	const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(input)?.[1];
	if (fromUrl) return fromUrl;
	return /^[a-zA-Z0-9_-]{10,}$/.test(input) ? input : null;
}

function spreadsheetUrl(spreadsheetId: string): string {
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

function escapedDriveQuery(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function columnIndex(column: string): number {
	let value = 0;
	for (const char of column.toUpperCase()) {
		value = value * 26 + (char.charCodeAt(0) - 64);
	}
	return value - 1;
}

function splitA1Range(range: string): { sheetTitle?: string; cells: string } {
	const quoted = /^'((?:[^']|'')+)'!(.+)$/.exec(range);
	if (quoted) {
		return {
			sheetTitle: quoted[1]?.replace(/''/g, "'"),
			cells: quoted[2] ?? "",
		};
	}
	const bang = range.lastIndexOf("!");
	if (bang > 0) {
		return { sheetTitle: range.slice(0, bang), cells: range.slice(bang + 1) };
	}
	return { cells: range };
}

export function a1ToGridRange(
	range: string,
	sheets: SheetProperties[],
): Record<string, number> | null {
	const { sheetTitle, cells } = splitA1Range(range.trim());
	const sheet = sheetTitle
		? sheets.find((candidate) => candidate.title === sheetTitle)
		: sheets[0];
	if (!sheet) return null;

	const match = /^([A-Za-z]+)?([1-9]\d*)?(?::([A-Za-z]+)?([1-9]\d*)?)?$/.exec(
		cells,
	);
	if (!match || (!match[1] && !match[2])) return null;
	const [, startColumn, startRow, endColumn, endRow] = match;
	const hasRangeEnd = cells.includes(":");
	const gridRange: Record<string, number> = { sheetId: sheet.sheetId };

	if (startColumn) {
		gridRange.startColumnIndex = columnIndex(startColumn);
		if (!hasRangeEnd) gridRange.endColumnIndex = gridRange.startColumnIndex + 1;
	}
	if (startRow) {
		gridRange.startRowIndex = Number(startRow) - 1;
		if (!hasRangeEnd) gridRange.endRowIndex = Number(startRow);
	}
	if (endColumn) gridRange.endColumnIndex = columnIndex(endColumn) + 1;
	if (endRow) gridRange.endRowIndex = Number(endRow);

	if (
		gridRange.startColumnIndex != null &&
		gridRange.endColumnIndex != null &&
		gridRange.endColumnIndex <= gridRange.startColumnIndex
	) {
		return null;
	}
	if (
		gridRange.startRowIndex != null &&
		gridRange.endRowIndex != null &&
		gridRange.endRowIndex <= gridRange.startRowIndex
	) {
		return null;
	}
	return gridRange;
}

function hexColor(hex: string): { red: number; green: number; blue: number } {
	return {
		red: Number.parseInt(hex.slice(1, 3), 16) / 255,
		green: Number.parseInt(hex.slice(3, 5), 16) / 255,
		blue: Number.parseInt(hex.slice(5, 7), 16) / 255,
	};
}

async function readMetadata(
	fetcher: Fetcher,
	auth: Record<string, string>,
	spreadsheetId: string,
): Promise<{ data?: SpreadsheetMetadata; response?: Response }> {
	const url = new URL(
		`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
	);
	url.searchParams.set(
		"fields",
		"spreadsheetId,spreadsheetUrl,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)))",
	);
	const response = await fetcher(url, { headers: auth });
	if (!response.ok) return { response };
	return { data: (await response.json()) as SpreadsheetMetadata };
}

async function batchUpdate(
	fetcher: Fetcher,
	auth: Record<string, string>,
	spreadsheetId: string,
	requests: Array<Record<string, unknown>>,
): Promise<Response> {
	return await fetcher(
		`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
		{
			method: "POST",
			headers: auth,
			body: JSON.stringify({ requests }),
		},
	);
}

function missing(message: string) {
	return { connected: true, error: message };
}

export async function executeGoogleSheetsOperation(
	input: GoogleSheetsInput,
	dependencies: GoogleSheetsDependencies,
): Promise<Record<string, unknown>> {
	const fetcher = dependencies.fetch ?? fetch;
	try {
		const token = await dependencies.getAccessToken();
		if ("error" in token) return { connected: false, error: token.error };
		const auth = {
			Authorization: `Bearer ${token.accessToken}`,
			"Content-Type": "application/json",
		};

		if (input.action === "list_spreadsheets") {
			const url = new URL(`${DRIVE_API}/files`);
			const clauses = [
				`mimeType = '${SPREADSHEET_MIME_TYPE}'`,
				"trashed = false",
			];
			if (input.query?.trim()) {
				clauses.push(
					`name contains '${escapedDriveQuery(input.query.trim())}'`,
				);
			}
			url.searchParams.set("q", clauses.join(" and "));
			url.searchParams.set("pageSize", String(input.maxResults ?? 10));
			url.searchParams.set("orderBy", "modifiedTime desc");
			url.searchParams.set("spaces", "drive");
			url.searchParams.set("includeItemsFromAllDrives", "true");
			url.searchParams.set("supportsAllDrives", "true");
			url.searchParams.set(
				"fields",
				"files(id,name,modifiedTime,owners(displayName,emailAddress),webViewLink,capabilities(canEdit))",
			);
			const response = await fetcher(url, { headers: auth });
			if (!response.ok) {
				return {
					connected: true,
					error: await dependencies.apiError(response, "Google Sheets"),
				};
			}
			const data = (await response.json()) as {
				files?: Array<{
					id: string;
					name: string;
					modifiedTime?: string;
					owners?: Array<{ displayName?: string; emailAddress?: string }>;
					webViewLink?: string;
					capabilities?: { canEdit?: boolean };
				}>;
			};
			return {
				connected: true,
				spreadsheets: (data.files ?? []).map((file) => ({
					spreadsheetId: file.id,
					title: file.name,
					modifiedTime: file.modifiedTime,
					owner:
						file.owners?.[0]?.displayName ?? file.owners?.[0]?.emailAddress,
					canEdit: file.capabilities?.canEdit ?? false,
					url: file.webViewLink ?? spreadsheetUrl(file.id),
				})),
			};
		}

		if (input.action === "create_spreadsheet") {
			if (!input.title)
				return missing("title is required to create a spreadsheet.");
			const response = await fetcher(`${SHEETS_API}/spreadsheets`, {
				method: "POST",
				headers: auth,
				body: JSON.stringify({
					properties: { title: input.title },
					...(input.sheetTitles?.length
						? {
								sheets: input.sheetTitles.map((title) => ({
									properties: { title },
								})),
							}
						: {}),
				}),
			});
			if (!response.ok) {
				return {
					connected: true,
					error: await dependencies.apiError(response, "Google Sheets"),
				};
			}
			const data = (await response.json()) as SpreadsheetMetadata;
			return {
				connected: true,
				created: true,
				spreadsheetId: data.spreadsheetId,
				title: data.properties?.title ?? input.title,
				url: data.spreadsheetUrl ?? spreadsheetUrl(data.spreadsheetId),
				sheets: (data.sheets ?? []).map((sheet) => sheet.properties),
			};
		}

		const spreadsheetId = normalizeSpreadsheetId(input.spreadsheetId);
		if (!spreadsheetId) {
			return missing(
				"A valid spreadsheetId or Google Sheets URL is required for this action.",
			);
		}

		if (input.action === "get_spreadsheet") {
			const result = await readMetadata(fetcher, auth, spreadsheetId);
			if (result.response) {
				return {
					connected: true,
					error: await dependencies.apiError(result.response, "Google Sheets"),
				};
			}
			const data = result.data as SpreadsheetMetadata;
			return {
				connected: true,
				spreadsheetId: data.spreadsheetId,
				title: data.properties?.title,
				locale: data.properties?.locale,
				timeZone: data.properties?.timeZone,
				url: data.spreadsheetUrl ?? spreadsheetUrl(spreadsheetId),
				sheets: (data.sheets ?? []).map((sheet) => sheet.properties),
			};
		}

		if (input.action === "read_range") {
			if (!input.range) return missing("range is required to read values.");
			const url = new URL(
				`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
			);
			url.searchParams.set(
				"valueRenderOption",
				input.valueRenderOption ?? "FORMATTED_VALUE",
			);
			const response = await fetcher(url, { headers: auth });
			if (!response.ok) {
				return {
					connected: true,
					error: await dependencies.apiError(response, "Google Sheets"),
				};
			}
			const data = (await response.json()) as {
				range?: string;
				majorDimension?: string;
				values?: unknown[][];
			};
			const sourceRows = data.values ?? [];
			const values = sourceRows.slice(0, 200).map((row) => row.slice(0, 50));
			return {
				connected: true,
				range: data.range ?? input.range,
				majorDimension: data.majorDimension ?? "ROWS",
				values,
				rowCount: sourceRows.length,
				returnedRows: values.length,
				truncated:
					sourceRows.length > values.length ||
					sourceRows.some((row) => row.length > 50),
			};
		}

		if (input.action === "write_range" || input.action === "append_rows") {
			if (!input.range) return missing("range is required to write values.");
			if (!input.values?.length)
				return missing("values are required to write values.");
			const operation = input.action === "append_rows" ? ":append" : "";
			const url = new URL(
				`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(input.range)}${operation}`,
			);
			url.searchParams.set(
				"valueInputOption",
				input.valueInputOption ?? "USER_ENTERED",
			);
			if (input.action === "append_rows") {
				url.searchParams.set("insertDataOption", "INSERT_ROWS");
			}
			url.searchParams.set("includeValuesInResponse", "false");
			const response = await fetcher(url, {
				method: input.action === "append_rows" ? "POST" : "PUT",
				headers: auth,
				body: JSON.stringify({
					range: input.range,
					majorDimension: "ROWS",
					values: input.values,
				}),
			});
			if (!response.ok) {
				return {
					connected: true,
					error: await dependencies.apiError(response, "Google Sheets"),
				};
			}
			const data = (await response.json()) as {
				updatedRange?: string;
				updatedRows?: number;
				updatedColumns?: number;
				updatedCells?: number;
				updates?: {
					updatedRange?: string;
					updatedRows?: number;
					updatedColumns?: number;
					updatedCells?: number;
				};
			};
			const update = data.updates ?? data;
			return {
				connected: true,
				[input.action === "append_rows" ? "appended" : "updated"]: true,
				updatedRange: update.updatedRange ?? input.range,
				updatedRows: update.updatedRows,
				updatedColumns: update.updatedColumns,
				updatedCells: update.updatedCells,
				url: spreadsheetUrl(spreadsheetId),
			};
		}

		if (input.action === "clear_range") {
			if (!input.range) return missing("range is required to clear values.");
			const response = await fetcher(
				`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(input.range)}:clear`,
				{ method: "POST", headers: auth, body: "{}" },
			);
			if (!response.ok) {
				return {
					connected: true,
					error: await dependencies.apiError(response, "Google Sheets"),
				};
			}
			const data = (await response.json()) as { clearedRange?: string };
			return {
				connected: true,
				cleared: true,
				clearedRange: data.clearedRange ?? input.range,
			};
		}

		let request: Record<string, unknown> | null = null;
		if (input.action === "rename_spreadsheet") {
			if (!input.title)
				return missing("title is required to rename a spreadsheet.");
			request = {
				updateSpreadsheetProperties: {
					properties: { title: input.title },
					fields: "title",
				},
			};
		} else if (input.action === "add_sheet") {
			if (!input.title) return missing("title is required to add a sheet.");
			request = {
				addSheet: {
					properties: {
						title: input.title,
						...(input.rowCount || input.columnCount
							? {
									gridProperties: {
										...(input.rowCount ? { rowCount: input.rowCount } : {}),
										...(input.columnCount
											? { columnCount: input.columnCount }
											: {}),
									},
								}
							: {}),
					},
				},
			};
		} else if (input.action === "rename_sheet") {
			if (input.sheetId == null || !input.newTitle) {
				return missing("sheetId and newTitle are required to rename a sheet.");
			}
			request = {
				updateSheetProperties: {
					properties: { sheetId: input.sheetId, title: input.newTitle },
					fields: "title",
				},
			};
		} else if (input.action === "duplicate_sheet") {
			if (input.sheetId == null) {
				return missing("sheetId is required to duplicate a sheet.");
			}
			request = {
				duplicateSheet: {
					sourceSheetId: input.sheetId,
					...(input.title ? { newSheetName: input.title } : {}),
				},
			};
		} else if (input.action === "delete_sheet") {
			if (input.sheetId == null)
				return missing("sheetId is required to delete a sheet.");
			request = { deleteSheet: { sheetId: input.sheetId } };
		} else if (
			input.action === "insert_rows" ||
			input.action === "delete_rows"
		) {
			if (input.sheetId == null || !input.startRow || !input.rowCount) {
				return missing(
					"sheetId, startRow and rowCount are required to insert or delete rows.",
				);
			}
			const range = {
				sheetId: input.sheetId,
				dimension: "ROWS",
				startIndex: input.startRow - 1,
				endIndex: input.startRow - 1 + input.rowCount,
			};
			request =
				input.action === "insert_rows"
					? {
							insertDimension: {
								range,
								inheritFromBefore: input.startRow > 1,
							},
						}
					: { deleteDimension: { range } };
		} else if (input.action === "format_range") {
			if (!input.range) return missing("range is required to format cells.");
			const metadata = await readMetadata(fetcher, auth, spreadsheetId);
			if (metadata.response) {
				return {
					connected: true,
					error: await dependencies.apiError(
						metadata.response,
						"Google Sheets",
					),
				};
			}
			const sheets = (metadata.data?.sheets ?? [])
				.map((sheet) => sheet.properties)
				.filter((properties): properties is SheetProperties => !!properties);
			const gridRange = a1ToGridRange(input.range, sheets);
			if (!gridRange) {
				return missing(
					"The formatting range is invalid or its sheet title was not found. Use A1 notation such as Sheet1!A1:D20.",
				);
			}
			const format: Record<string, unknown> = {};
			const fields: string[] = [];
			if (input.backgroundColor) {
				format.backgroundColor = hexColor(input.backgroundColor);
				fields.push("userEnteredFormat.backgroundColor");
			}
			const textFormat: Record<string, unknown> = {};
			if (input.textColor) {
				textFormat.foregroundColor = hexColor(input.textColor);
				fields.push("userEnteredFormat.textFormat.foregroundColor");
			}
			if (input.bold != null) {
				textFormat.bold = input.bold;
				fields.push("userEnteredFormat.textFormat.bold");
			}
			if (input.italic != null) {
				textFormat.italic = input.italic;
				fields.push("userEnteredFormat.textFormat.italic");
			}
			if (Object.keys(textFormat).length) format.textFormat = textFormat;
			if (input.horizontalAlignment) {
				format.horizontalAlignment = input.horizontalAlignment;
				fields.push("userEnteredFormat.horizontalAlignment");
			}
			if (input.numberFormatType || input.numberFormatPattern) {
				format.numberFormat = {
					type: input.numberFormatType ?? "NUMBER",
					...(input.numberFormatPattern
						? { pattern: input.numberFormatPattern }
						: {}),
				};
				fields.push("userEnteredFormat.numberFormat");
			}
			if (!fields.length)
				return missing("At least one format option is required.");
			request = {
				repeatCell: {
					range: gridRange,
					cell: { userEnteredFormat: format },
					fields: fields.join(","),
				},
			};
		}

		if (!request) return missing("Unsupported Google Sheets action.");
		const response = await batchUpdate(fetcher, auth, spreadsheetId, [request]);
		if (!response.ok) {
			return {
				connected: true,
				error: await dependencies.apiError(response, "Google Sheets"),
			};
		}
		const data = (await response.json()) as {
			replies?: Array<Record<string, unknown>>;
		};
		return {
			connected: true,
			success: true,
			action: input.action,
			replies: data.replies ?? [],
			url: spreadsheetUrl(spreadsheetId),
		};
	} catch (error) {
		return {
			connected: false,
			error:
				error instanceof Error ? error.message : "Google Sheets request failed",
		};
	}
}

export function makeGoogleSheetsTool(dependencies: GoogleSheetsDependencies) {
	return tool({
		description: [
			"Read, create and modify the user's connected Google Sheets spreadsheets.",
			"",
			"Discovery and reading:",
			"- list_spreadsheets: find Sheets by name or list recently modified files.",
			"- get_spreadsheet: inspect the spreadsheet title and tabs (including numeric sheetId values).",
			"- read_range: read an A1 range. Keep ranges focused; results are capped at 200 rows × 50 columns.",
			"",
			"Values and files:",
			"- create_spreadsheet / rename_spreadsheet.",
			"- write_range: overwrite a range; append_rows: add rows after a table; clear_range: remove values.",
			"",
			"Tabs, rows and formatting:",
			"- add_sheet / rename_sheet / duplicate_sheet / delete_sheet.",
			"- insert_rows / delete_rows (row numbers are 1-based).",
			"- format_range: apply colors, bold/italic, alignment and number/date formats.",
			"",
			"Accept a full Sheets URL anywhere spreadsheetId is requested. Use list_spreadsheets or get_spreadsheet first when the target is unclear. Never write, clear, delete or rename unless the user's target is explicit or unambiguous. After a mutation, report exactly what changed and include the returned spreadsheet URL. If Sheets is not connected, tell the user to connect it in Settings → Connectors.",
		].join("\n"),
		inputSchema: googleSheetsInputSchema,
		execute: async (input) =>
			await executeGoogleSheetsOperation(input, dependencies),
	});
}
