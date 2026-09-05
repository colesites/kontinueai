import { describe, expect, test } from "bun:test";
import { detectProvider } from "./url-safety";

describe("detectProvider", () => {
	test("recognises every Gemini share host", () => {
		expect(detectProvider("https://share.gemini.google/tVLQxRAhztEb")).toBe(
			"gemini",
		);
		expect(detectProvider("https://gemini.google.com/share/faa2c48cf84a")).toBe(
			"gemini",
		);
		expect(detectProvider("https://g.co/gemini/share/abc123")).toBe("gemini");
	});

	test("does not treat other g.co links as Gemini", () => {
		expect(detectProvider("https://g.co/cloud/gemini-for-business")).toBe(
			"unknown",
		);
	});
});
