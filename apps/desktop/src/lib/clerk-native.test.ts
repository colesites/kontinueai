import { beforeEach, describe, expect, test } from "bun:test";
import {
	applyNativeClerkRequest,
	attachNativeClerkAuth,
	captureNativeClerkResponse,
	type NativeClerkLike,
	type NativeFapiRequest,
} from "./clerk-native";

const storage = new Map<string, string>();

beforeEach(() => {
	storage.clear();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
		},
	});
});

describe("native Clerk requests", () => {
	test("sends the saved client JWT and does not use cookies", () => {
		storage.set("__clerk_client_jwt", "client-jwt");
		const request: NativeFapiRequest = { url: new URL("https://clerk.example/v1/client") };

		applyNativeClerkRequest(request);

		expect(request.credentials).toBe("omit");
		expect(request.url?.searchParams.get("_is_native")).toBe("1");
		expect(new Headers(request.headers).get("Authorization")).toBe(
			"Bearer client-jwt",
		);
	});

	test("stores the client JWT Clerk returns", () => {
		captureNativeClerkResponse({
			headers: { get: () => "Bearer next-jwt" },
		});

		expect(storage.get("__clerk_client_jwt")).toBe("next-jwt");
	});

	test("wires both clerk-js 5 and 6 hook names", () => {
		const calls: string[] = [];
		const clerk: NativeClerkLike = {
			__unstable__onBeforeRequest: () => calls.push("before"),
			__unstable__onAfterResponse: () => calls.push("after"),
		};

		attachNativeClerkAuth(clerk);

		expect(calls).toEqual(["before", "after"]);
	});
});
