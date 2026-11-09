import { describe, expect, test } from "bun:test";
import {
	getCanvasModelById,
	K_IMAGE_MODEL_ID,
	K_VIDEO_MODEL_ID,
	maxReferenceImagesFor,
} from "@repo/ai/lib/canvas-models";
import { nextPlanWithMore } from "@repo/core/plan-config";
import { resolveReferenceImages } from "../app/api/lib/reference-images";

const multi = getCanvasModelById("google/gemini-3-pro-image");
const single = getCanvasModelById(K_IMAGE_MODEL_ID);
const video = getCanvasModelById(K_VIDEO_MODEL_ID);
const urls = (n: number) =>
	Array.from({ length: n }, (_, i) => `https://files.test/${i}.png`);

describe("maxReferenceImagesFor", () => {
	test("plan allowance caps multi-image models", () => {
		expect(maxReferenceImagesFor(multi, 4)).toBe(4);
		expect(maxReferenceImagesFor(multi, 8)).toBe(8);
	});
	test("single-image models and video stay at 1", () => {
		expect(maxReferenceImagesFor(single, 8)).toBe(1);
		expect(maxReferenceImagesFor(video, 8)).toBe(1);
	});
	test("plans without canvas get none", () => {
		expect(maxReferenceImagesFor(multi, 0)).toBe(0);
	});
});

describe("resolveReferenceImages", () => {
	test("accepts up to the plan limit", () => {
		if (!multi) throw new Error("model missing");
		const r = resolveReferenceImages({ images: urls(4) }, multi, "pro");
		expect("images" in r && r.images.length).toBe(4);
	});
	test("rejects more than the plan allows and suggests Max", async () => {
		if (!multi) throw new Error("model missing");
		const r = resolveReferenceImages({ images: urls(5) }, multi, "pro");
		if (!("error" in r)) throw new Error("expected error");
		const body = await r.error.json();
		expect(body.code).toBe("INVALID_REQUEST");
		expect(body.upgradeTo).toBe("max");
	});
	test("model cap gives no upgrade suggestion", async () => {
		if (!single) throw new Error("model missing");
		const r = resolveReferenceImages({ images: urls(2) }, single, "max");
		if (!("error" in r)) throw new Error("expected error");
		expect((await r.error.json()).upgradeTo).toBeUndefined();
	});
	test("still reads the old single `image` field", () => {
		if (!single) throw new Error("model missing");
		const r = resolveReferenceImages({ image: urls(1)[0] }, single, "pro");
		expect("images" in r && r.images).toEqual(urls(1));
	});
	test("rejects non-http URLs", () => {
		if (!single) throw new Error("model missing");
		const r = resolveReferenceImages(
			{ images: ["file:///etc/passwd"] },
			single,
			"pro",
		);
		expect("error" in r).toBe(true);
	});
});

test("nextPlanWithMore finds the cheapest bigger plan", () => {
	expect(nextPlanWithMore("free", (p) => p.canvasReferenceImages)).toBe("pro");
	expect(
		nextPlanWithMore("max", (p) => p.canvasReferenceImages),
	).toBeUndefined();
});
