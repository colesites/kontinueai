import { describe, expect, test } from "bun:test";
import {
	a1ToGridRange,
	executeGoogleSheetsOperation,
	type GoogleSheetsDependencies,
	normalizeSpreadsheetId,
} from "./google-sheets-tool";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function dependencies(fetcher: NonNullable<GoogleSheetsDependencies["fetch"]>) {
	return {
		getAccessToken: async () => ({ accessToken: "google-token" }),
		apiError: async (response: Response, label: string) =>
			`${label} API error ${response.status}`,
		fetch: fetcher,
	} satisfies GoogleSheetsDependencies;
}

describe("Google Sheets connector", () => {
	test("accepts spreadsheet IDs and full Google Sheets URLs", () => {
		const id = "1abcDEF_ghiJKLmnopQRSTuv";
		expect(normalizeSpreadsheetId(id)).toBe(id);
		expect(
			normalizeSpreadsheetId(
				`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`,
			),
		).toBe(id);
		expect(normalizeSpreadsheetId("not a spreadsheet")).toBeNull();
	});

	test("converts common A1 ranges to Sheets grid ranges", () => {
		const sheets = [
			{ sheetId: 10, title: "Sheet1" },
			{ sheetId: 20, title: "Annual Budget" },
		];
		expect(a1ToGridRange("Sheet1!A1:D10", sheets)).toEqual({
			sheetId: 10,
			startColumnIndex: 0,
			startRowIndex: 0,
			endColumnIndex: 4,
			endRowIndex: 10,
		});
		expect(a1ToGridRange("'Annual Budget'!B:B", sheets)).toEqual({
			sheetId: 20,
			startColumnIndex: 1,
			endColumnIndex: 2,
		});
	});

	test("discovers spreadsheets with Drive metadata only", async () => {
		let requestedUrl = "";
		const result = await executeGoogleSheetsOperation(
			{ action: "list_spreadsheets", query: "Budget", maxResults: 5 },
			dependencies(async (input) => {
				requestedUrl = String(input);
				return jsonResponse({
					files: [
						{
							id: "spreadsheet-123",
							name: "Annual Budget",
							modifiedTime: "2026-07-16T10:00:00Z",
							capabilities: { canEdit: true },
						},
					],
				});
			}),
		);

		const url = new URL(requestedUrl);
		expect(url.hostname).toBe("www.googleapis.com");
		expect(url.searchParams.get("pageSize")).toBe("5");
		expect(url.searchParams.get("q")).toContain("name contains 'Budget'");
		expect(result.spreadsheets).toEqual([
			{
				spreadsheetId: "spreadsheet-123",
				title: "Annual Budget",
				modifiedTime: "2026-07-16T10:00:00Z",
				owner: undefined,
				canEdit: true,
				url: "https://docs.google.com/spreadsheets/d/spreadsheet-123/edit",
			},
		]);
	});

	test("reads an encoded A1 range and caps tool output", async () => {
		const rows = Array.from({ length: 205 }, (_, row) =>
			Array.from({ length: 55 }, (_, column) => `${row}:${column}`),
		);
		let requestedUrl = "";
		const result = await executeGoogleSheetsOperation(
			{
				action: "read_range",
				spreadsheetId: "spreadsheet-123",
				range: "Annual Budget!A1:BC205",
			},
			dependencies(async (input) => {
				requestedUrl = String(input);
				return jsonResponse({
					range: "'Annual Budget'!A1:BC205",
					values: rows,
				});
			}),
		);

		expect(requestedUrl).toContain("Annual%20Budget!A1%3ABC205");
		expect(result.returnedRows).toBe(200);
		expect((result.values as unknown[][])[0]).toHaveLength(50);
		expect(result.truncated).toBe(true);
	});

	test("writes formulas using USER_ENTERED by default", async () => {
		let requestedUrl = "";
		let requestedInit: RequestInit | undefined;
		const result = await executeGoogleSheetsOperation(
			{
				action: "write_range",
				spreadsheetId: "spreadsheet-123",
				range: "Sheet1!A1:B2",
				values: [
					["Amount", "Total"],
					[10, "=A2*2"],
				],
			},
			dependencies(async (input, init) => {
				requestedUrl = String(input);
				requestedInit = init;
				return jsonResponse({
					updatedRange: "Sheet1!A1:B2",
					updatedRows: 2,
					updatedColumns: 2,
					updatedCells: 4,
				});
			}),
		);

		expect(requestedInit?.method).toBe("PUT");
		expect(new URL(requestedUrl).searchParams.get("valueInputOption")).toBe(
			"USER_ENTERED",
		);
		expect(JSON.parse(String(requestedInit?.body))).toMatchObject({
			values: [
				["Amount", "Total"],
				[10, "=A2*2"],
			],
		});
		expect(result.updated).toBe(true);
		expect(result.updatedCells).toBe(4);
	});

	test("does not call Google when Sheets is disconnected", async () => {
		let called = false;
		const result = await executeGoogleSheetsOperation(
			{ action: "list_spreadsheets" },
			{
				getAccessToken: async () => ({
					error: "google_sheets is not connected.",
				}),
				apiError: async () => "unexpected",
				fetch: async () => {
					called = true;
					return jsonResponse({});
				},
			},
		);

		expect(called).toBe(false);
		expect(result).toEqual({
			connected: false,
			error: "google_sheets is not connected.",
		});
	});
});
