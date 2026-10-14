import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Browser-based desktop sign-in (the same pattern ChatGPT / Claude desktop use).
 *
 * 1. The app starts a localhost loopback listener (via Rust tauri-plugin-oauth).
 * 2. It opens the browser at `${WEB_APP_URL}/desktop-auth?state=…&mode=…&callback_port=PORT`.
 * 3. The user authenticates in their browser (Google, email, etc.).
 * 4. The browser automatically redirects to `http://localhost:PORT/?ticket=…&state=…`.
 * 5. In production / packaged app, it also falls back to `kontinueai://auth/callback`.
 * 6. The app exchanges the ticket for a Clerk session.
 */

export const WEB_APP_URL = (
	import.meta.env.VITE_WEB_APP_URL ?? "https://chat.kontinueai.com"
).replace(/\/+$/, "");

export const DEEP_LINK_SCHEME = "kontinueai:";

const PENDING_KEY = "kontinueai.desktop-auth.pending";
const PENDING_TTL_MS = 10 * 60 * 1000;

type PendingAuth = { state: string; port?: number; expiresAt: number };

function randomState() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readPending(): PendingAuth | null {
	try {
		const raw = localStorage.getItem(PENDING_KEY);
		if (!raw) return null;
		const pending = JSON.parse(raw) as PendingAuth;
		if (typeof pending.state !== "string" || pending.expiresAt < Date.now()) {
			localStorage.removeItem(PENDING_KEY);
			return null;
		}
		return pending;
	} catch {
		return null;
	}
}

export function hasPendingBrowserSignIn() {
	return readPending() !== null;
}

export function clearPendingBrowserSignIn() {
	localStorage.removeItem(PENDING_KEY);
}

export function browserSignInUrl(
	state: string,
	mode: "sign-in" | "sign-up" = "sign-in",
	port?: number,
) {
	const params = new URLSearchParams({
		state,
		mode,
	});
	if (port) {
		params.set("callback_port", String(port));
	}
	return `${WEB_APP_URL}/desktop-auth?${params.toString()}`;
}

/** Opens the system browser with localhost loopback server listening. */
export async function startBrowserSignIn(mode: "sign-in" | "sign-up" = "sign-in") {
	// Try to start local loopback HTTP server
	let port: number | undefined;
	try {
		port = await invoke<number>("start_desktop_auth_server");
	} catch (e) {
		console.warn("Could not start localhost loopback server, using deep-link:", e);
	}

	const pending: PendingAuth = {
		state: randomState(),
		port,
		expiresAt: Date.now() + PENDING_TTL_MS,
	};
	localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
	await openUrl(browserSignInUrl(pending.state, mode, port));
}

export type CallbackResult =
	| { ok: true; ticket: string }
	| { ok: false; reason: string }
	| null;

/**
 * Validates a callback URL (from localhost loopback OR kontinueai:// deep-link).
 */
export function parseAuthCallback(rawUrl: string): CallbackResult {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}

	const isDeepLink = url.protocol === DEEP_LINK_SCHEME;
	const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

	if (!isDeepLink && !isLocalhost) {
		return null;
	}

	// For deep links, ensure route is auth/callback
	if (isDeepLink) {
		const route = `${url.host}${url.pathname}`.replace(/\/+$/, "");
		if (route !== "auth/callback") return null;
	}

	const ticket = url.searchParams.get("ticket");
	const state = url.searchParams.get("state");
	const pending = readPending();

	if (!ticket || !state) {
		return { ok: false, reason: "The sign-in link was incomplete." };
	}
	if (!pending || pending.state !== state) {
		return {
			ok: false,
			reason:
				"This sign-in link wasn't started from this app or has expired. Please try again.",
		};
	}
	clearPendingBrowserSignIn();
	return { ok: true, ticket };
}
