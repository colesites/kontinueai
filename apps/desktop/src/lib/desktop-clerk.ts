import { Clerk } from "@clerk/clerk-js";
import { attachNativeClerkAuth, type NativeClerkLike } from "./clerk-native";

let cached: { key: string; clerk: Clerk } | null = null;

/** One Clerk instance per publishable key, running in native (no-cookie) mode. */
export function getDesktopClerk(publishableKey: string) {
	if (cached?.key === publishableKey) return cached.clerk;
	const clerk = new Clerk(publishableKey);
	attachNativeClerkAuth(clerk as NativeClerkLike);
	cached = { key: publishableKey, clerk };
	return clerk;
}
