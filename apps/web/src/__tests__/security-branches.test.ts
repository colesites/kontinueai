import { describe, expect, test } from "bun:test";
import {
	PLAN_ERROR_CODES,
	planDeniedResponse,
} from "../app/api/lib/plan-denial";
import { sharedSecretMatches } from "../app/api/lib/shared-secret";

describe("security branches", () => {
	test("insufficient plan returns 403 with a stable error code", () => {
		const response = planDeniedResponse(
			PLAN_ERROR_CODES.KODE_PRO_REQUIRED,
			"Pro required",
		);
		expect(response.status).toBe(403);
		expect(response.headers.get("x-error-code")).toBe("KODE_PRO_REQUIRED");
	});

	test("shared server secrets reject missing and incorrect values", () => {
		expect(sharedSecretMatches(undefined, null)).toBe(false);
		expect(sharedSecretMatches("expected", null)).toBe(false);
		expect(sharedSecretMatches("expected", "wrong")).toBe(false);
		expect(sharedSecretMatches("expected", "expected-extra")).toBe(false);
		expect(sharedSecretMatches("expected", "expected")).toBe(true);
	});

	test("secret-guarded callbacks reject requests before processing", async () => {
		const { POST } = await import("../app/api/canvas/video-job/callback/route");
		const missing = await POST(
			new Request("https://app.test/api/canvas/video-job/callback", {
				method: "POST",
			}),
		);
		const incorrect = await POST(
			new Request("https://app.test/api/canvas/video-job/callback", {
				method: "POST",
				headers: { "x-agent-secret": "definitely-incorrect" },
			}),
		);
		expect(missing.status).toBe(403);
		expect(incorrect.status).toBe(403);
	});
});
