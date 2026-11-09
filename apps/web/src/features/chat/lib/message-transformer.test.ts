import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
	collectAttachmentsFromParts,
	collectImageUrlsFromParts,
	pickGeneratedImages,
} from "./message-transformer";

describe("pickGeneratedImages", () => {
	test("shows inline images until they are saved", () => {
		expect(pickGeneratedImages(["data:a"], [], [])).toEqual(["data:a"]);
	});
	test("switches to saved copies instead of listing both", () => {
		expect(pickGeneratedImages(["data:a"], ["https://s/a.webp"], [])).toEqual([
			"https://s/a.webp",
		]);
	});
	test("keeps inline images when only some were saved", () => {
		expect(
			pickGeneratedImages(["data:a", "data:b"], ["https://s/a.webp"], []),
		).toEqual(["data:a", "data:b"]);
	});
	test("uses stored copies after a reload", () => {
		expect(pickGeneratedImages([], [], ["https://s/a.webp"])).toEqual([
			"https://s/a.webp",
		]);
	});
});

describe("tool image output", () => {
	test("labels JPEG output as JPEG", () => {
		const parts = [
			{ type: "tool-image_generation", output: { result: "/9j/4AAQ" } },
		] as unknown as UIMessage["parts"];
		expect(collectImageUrlsFromParts(parts)[0]).toStartWith(
			"data:image/jpeg;base64,",
		);
	});
});

describe("collectAttachmentsFromParts", () => {
	test("keeps the file name and type of user uploads", () => {
		const parts = [
			{ type: "text", text: "what is this?" },
			{
				type: "file",
				url: "data:image/png;base64,AAA",
				filename: "photo.png",
				mediaType: "image/png",
			},
		] as unknown as UIMessage["parts"];
		expect(collectAttachmentsFromParts(parts)).toEqual([
			{
				url: "data:image/png;base64,AAA",
				filename: "photo.png",
				mediaType: "image/png",
			},
		]);
	});
});
