import { afterEach, describe, expect, test } from "bun:test";
import { parseAuthCallback, releaseAuthTicket } from "./desktop-auth";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function storage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
		clear: () => values.clear(),
		key: (index: number) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
	} satisfies Storage;
}

afterEach(() => {
	if (original) Object.defineProperty(globalThis, "localStorage", original);
	else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("desktop auth callback", () => {
	test("accepts one ticket from both the loopback and the app link", () => {
		Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage() });
		const state = "d".repeat(64);
		localStorage.setItem(
			"kontinueai.desktop-auth.pending",
			JSON.stringify({ state, expiresAt: Date.now() + 60_000 }),
		);
		const loopback = `http://127.0.0.1:53123/?ticket=once.token&state=${state}`;
		const deepLink = `kontinueai://auth/callback?ticket=once.token&state=${state}`;

		expect(parseAuthCallback(loopback)).toEqual({ ok: true, ticket: "once.token" });
		expect(parseAuthCallback(deepLink)).toBeNull();
		releaseAuthTicket("once.token");
	});
});
