import {
	type CanvasModel,
	maxReferenceImagesFor,
} from "@repo/ai/lib/canvas-models";
import { nextPlanWithMore, PLAN_DEFINITIONS } from "@repo/core/plan-config";
import type { PlanTier } from "@repo/core/plan-tier";
import { apiError } from "./api-error";

// Reads reference images from a canvas request (`images`, or the older single
// `image`) and checks them against the plan and model. Returns the URLs to use,
// or an error response to send back.
export function resolveReferenceImages(
	body: { images?: unknown; image?: unknown },
	model: CanvasModel,
	planTier: PlanTier,
): { images: string[] } | { error: Response } {
	const raw = Array.isArray(body.images)
		? body.images
		: typeof body.image === "string" && body.image
			? [body.image]
			: [];
	const images = Array.from(new Set(raw.filter((v) => typeof v === "string")));

	for (const url of images) {
		let ok = false;
		try {
			const parsed = new URL(url);
			ok = parsed.protocol === "https:" || parsed.protocol === "http:";
		} catch {
			ok = false;
		}
		if (!ok || images.length !== raw.length) {
			return {
				error: apiError("INVALID_REQUEST", {
					title: "Reference image not valid",
					message:
						"One of the attached images couldn't be read. Remove it and attach it again.",
				}),
			};
		}
	}

	const plan = PLAN_DEFINITIONS[planTier];
	const max = maxReferenceImagesFor(model, plan.canvasReferenceImages);
	if (images.length > max) {
		const planIsCap = max >= plan.canvasReferenceImages;
		const upgradeTo = planIsCap
			? nextPlanWithMore(planTier, (p) => p.canvasReferenceImages)
			: undefined;
		return {
			error: apiError(max === 0 ? "PLAN_REQUIRED" : "INVALID_REQUEST", {
				title: "Too many reference images",
				message:
					max === 0
						? "Reference images aren't available with this model on your plan."
						: `${model.name} takes up to ${max} reference image${max === 1 ? "" : "s"} on ${plan.name}. Remove ${images.length - max} and try again.`,
				upgradeTo,
			}),
		};
	}
	return { images };
}
