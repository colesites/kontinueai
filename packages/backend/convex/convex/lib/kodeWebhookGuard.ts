// Who may start a Kode thread through a webhook, and which events it reacts to.
//
// Signatures: GitHub signs the body with HMAC-SHA256 (X-Hub-Signature-256:
// sha256=<hex>), GitLab echoes the secret (X-Gitlab-Token), and any other
// service can sign like GitHub with X-Kode-Signature. A delivery that carries a
// signature must match; one without is accepted only when the webhook doesn't
// require signing.

import type { WebhookKind, WebhookSummary } from "./kodeWebhookSummary";

export type WebhookFilters = {
	/** Event kinds to react to; empty = all. */
	kinds?: WebhookKind[];
	/** Branch patterns ("main", "release/*"); empty = all. Events without a branch pass. */
	branches?: string[];
	/** Only events caused by these usernames; empty = anyone. Events without a known author are dropped when set. */
	authors?: string[];
};

export type SignatureCheck = "ok" | "unsigned" | "bad_signature";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares without leaking where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function hmacSha256Hex(secret: string, body: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	// Copy into a plain ArrayBuffer: Web Crypto's types reject views that may sit on a SharedArrayBuffer.
	return toHex(await crypto.subtle.sign("HMAC", key, new Uint8Array(body)));
}

export async function checkSignature(
	headers: (name: string) => string | null,
	body: Uint8Array,
	secret: string | null,
): Promise<SignatureCheck> {
	const hmac = headers("x-hub-signature-256") ?? headers("x-kode-signature");
	const gitlab = headers("x-gitlab-token");
	if (!hmac && !gitlab) return "unsigned";
	if (!secret) return "bad_signature";
	if (gitlab) return safeEqual(gitlab, secret) ? "ok" : "bad_signature";
	const given = (hmac ?? "").trim().toLowerCase().replace(/^sha256=/, "");
	return safeEqual(given, await hmacSha256Hex(secret, body)) ? "ok" : "bad_signature";
}

function branchMatches(branch: string, pattern: string): boolean {
	const p = pattern.trim();
	if (!p) return false;
	const regex = new RegExp(`^${p.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
	return regex.test(branch);
}

/** Why an event is filtered out, or null when the webhook should react to it. */
export function filterReason(filters: WebhookFilters | undefined, event: Pick<WebhookSummary, "kind" | "branch" | "author">): string | null {
	if (!filters) return null;
	if (filters.kinds?.length && !filters.kinds.includes(event.kind)) return "kind";
	const branches = (filters.branches ?? []).filter((b) => b.trim());
	if (branches.length && event.branch && !branches.some((p) => branchMatches(event.branch as string, p))) return "branch";
	const authors = (filters.authors ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
	if (authors.length && (!event.author || !authors.includes(event.author.toLowerCase()))) return "author";
	return null;
}
