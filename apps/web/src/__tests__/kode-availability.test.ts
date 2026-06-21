import { describe, expect, test } from "bun:test";
import { resolveKodeComingSoon } from "../features/kode/lib/availability-policy";

describe("Kode availability", () => {
	test("PLAN-006: production displays Coming soon while Kode is disabled", () => {
		expect(resolveKodeComingSoon({ host: "chat.kontinueai.com" })).toBe(true);
		expect(resolveKodeComingSoon({ host: "chat.kontinueai.com:443" })).toBe(
			true,
		);
	});

	test("PLAN-006: explicit production enablement removes Coming soon", () => {
		expect(
			resolveKodeComingSoon({
				host: "chat.kontinueai.com",
				productionEnabled: "true",
			}),
		).toBe(false);
	});

	test("PLAN-007: previews use the same feature unless production is forced", () => {
		expect(resolveKodeComingSoon({ host: "preview.example.test" })).toBe(false);
		expect(
			resolveKodeComingSoon({
				host: "preview.example.test",
				vercelEnv: "production",
			}),
		).toBe(true);
	});
});
