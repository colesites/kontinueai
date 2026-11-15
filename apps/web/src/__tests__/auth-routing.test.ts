import { describe, expect, test } from "bun:test";
import {
	clerkPostAuthRedirect,
	desktopAuthResumePath,
	desktopSignInRedirects,
	desktopSignUpRedirects,
	isPublicAuthRoute,
	PROTECTED_APP_ROUTES,
	protectedAppRedirect,
	shouldResumeDesktopAuth,
} from "../lib/auth-routing";
import { desktopHandoffTargets } from "../lib/desktop-handoff";

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

	test("AUTH-007: desktop handoff redirect_url is kept, other targets are dropped", () => {
		const origin = "https://chat.kontinueai.com";
		const state = "a".repeat(64);
		expect(
			clerkPostAuthRedirect(
				`/desktop-auth?state=${state}&mode=sign-in`,
				origin,
			),
		).toBe(`/desktop-auth?state=${state}&mode=sign-in`);
		expect(clerkPostAuthRedirect("/", origin)).toBeUndefined();
		expect(
			clerkPostAuthRedirect(
				`https://clerk.chat.kontinueai.com/desktop-auth?state=${state}`,
				origin,
			),
		).toBeUndefined();
		expect(
			clerkPostAuthRedirect(`/desktop-auth?state=not-valid`, origin),
		).toBeUndefined();
	});

	test("AUTH-008: a finished browser login resumes on the web app, not during sign-in", () => {
		const origin = "https://chat.kontinueai.com";
		const state = "b".repeat(64);
		const returnTo = `/desktop-auth?state=${state}&mode=sign-up&callback_port=53123`;
		expect(shouldResumeDesktopAuth("/")).toBe(true);
		expect(shouldResumeDesktopAuth("/settings")).toBe(true);
		expect(shouldResumeDesktopAuth("/sign-in")).toBe(false);
		expect(shouldResumeDesktopAuth("/sign-up/verify-email-address")).toBe(
			false,
		);
		expect(shouldResumeDesktopAuth("/desktop-auth")).toBe(false);
		expect(desktopAuthResumePath(returnTo, "/", origin)).toBe(returnTo);
		expect(
			desktopAuthResumePath(returnTo, "/sign-in/sso-callback", origin),
		).toBeUndefined();
		expect(
			desktopAuthResumePath("https://evil.example/desktop-auth", "/", origin),
		).toBeUndefined();
		expect(desktopSignInRedirects(returnTo).signUpUrl).toBe(
			`/sign-up?redirect_url=${encodeURIComponent(returnTo)}`,
		);
		expect(desktopSignUpRedirects(returnTo).signInForceRedirectUrl).toBe(
			returnTo,
		);
		expect(desktopSignInRedirects(undefined)).toEqual({});
	});

	test("AUTH-009: the handoff opens the desktop app and the local callback", () => {
		const state = "c".repeat(64);
		const targets = desktopHandoffTargets(state, "ticket.one", "53123");
		expect(targets.deepLink).toBe(
			`kontinueai://auth/callback?ticket=ticket.one&state=${state}`,
		);
		expect(targets.loopback).toBe(
			`http://127.0.0.1:53123/?ticket=ticket.one&state=${state}`,
		);
		expect(desktopHandoffTargets(state, "ticket.one").loopback).toBeNull();
		expect(desktopHandoffTargets(state, "ticket.one", "0").loopback).toBeNull();
	});
});
