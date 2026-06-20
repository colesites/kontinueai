import { describe, expect, test } from "bun:test";
import { buildKodePreviewDocument, kodeDownloadFilename } from "./preview";

describe("buildKodePreviewDocument", () => {
	test("inlines local CSS and JavaScript references", () => {
		const result = buildKodePreviewDocument([
			{
				path: "index.html",
				content:
					'<html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hello</h1><script src="script.js"></script></body></html>',
			},
			{ path: "styles.css", content: "h1 { color: red; }" },
			{ path: "script.js", content: "document.body.dataset.ready = 'yes';" },
		]);

		expect(result).toContain("Content-Security-Policy");
		expect(result).toContain("h1 { color: red; }");
		expect(result).toContain("document.body.dataset.ready");
		expect(result).not.toContain('href="styles.css"');
		expect(result).not.toContain('src="script.js"');
	});

	test("wraps an HTML fragment in a document", () => {
		const result = buildKodePreviewDocument([
			{ path: "index.html", content: "<main>Ready</main>" },
		]);
		expect(result).toStartWith("<!doctype html>");
		expect(result).toContain("<main>Ready</main>");
	});
});

test("kodeDownloadFilename creates a safe HTML filename", () => {
	expect(kodeDownloadFilename("Client Portal — v2")).toBe(
		"client-portal-v2.html",
	);
});
