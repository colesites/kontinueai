import { describe, expect, test } from "bun:test";
import {
	isPublicAuthRoute,
	PROTECTED_APP_ROUTES,
	protectedAppRedirect,
} from "../lib/auth-routing";

describe("authentication routing", () => {
	test("AUTH-001: unauthenticated users are redirected from the app shell", () => {
		for (const route of PROTECTED_APP_ROUTES) {
			expect(route).toBeString();
			expect(protectedAppRedirect(null)).toBe("/sign-in");
		}
	});

	test("AUTH-002: sign-in and sign-up routes remain public", () => {
		expect(isPublicAuthRoute("/sign-in")).toBe(true);
		expect(isPublicAuthRoute("/sign-in/factor-one")).toBe(true);
		expect(isPublicAuthRoute("/sign-up")).toBe(true);
		expect(isPublicAuthRoute("/sign-up/verify-email-address")).toBe(true);
		expect(isPublicAuthRoute("/chat/abc")).toBe(false);
	});

	test("AUTH-003: a valid session is allowed to render the app shell", () => {
		expect(protectedAppRedirect("user_123")).toBeNull();
	});

	test("AUTH-006: unresolved authentication cannot render protected content", () => {
		expect(protectedAppRedirect(null)).not.toBeNull();
	});
});
