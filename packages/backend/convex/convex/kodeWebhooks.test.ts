import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { summarizeWebhook } from "./lib/kodeWebhookSummary";
import { checkSignature, filterReason, hmacSha256Hex } from "./lib/kodeWebhookGuard";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./_generated/api.ts": () => import("./_generated/api"),
	"./kodeWebhooks.ts": () => import("./kodeWebhooks"),
	"./http.ts": () => import("./http"),
};

const USER = { subject: "clerk_hook_user", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_hook_user" };
const OTHER = { subject: "clerk_hook_other", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_hook_other" };

async function seed(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) => {
		for (const [id, email] of [[USER.subject, "hooks@example.test"], [OTHER.subject, "other@example.test"]]) {
			await ctx.db.insert("users", { clerkUserId: id, email, plan: "free", createdAt: Date.now() });
		}
	});
}

const headers = (map: Record<string, string>) => (name: string) => map[name.toLowerCase()] ?? null;

describe("webhook summaries", () => {
	test("summarizes GitHub and GitLab events and drops noise", () => {
		const failed = summarizeWebhook(headers({ "x-github-event": "workflow_run" }), JSON.stringify({
			action: "completed",
			repository: { full_name: "acme/app" },
			workflow_run: { conclusion: "failure", name: "CI", head_branch: "main", html_url: "https://github.com/acme/app/actions/runs/1", head_commit: { message: "Fix" } },
		}));
		expect(failed.summary).toContain('CI failed in acme/app: workflow "CI" on main');
		expect(summarizeWebhook(headers({ "x-github-event": "ping" }), "{}").summary).toBeNull();
		expect(summarizeWebhook(headers({ "x-github-event": "workflow_run" }), JSON.stringify({ action: "completed", workflow_run: { conclusion: "success" } })).summary).toBeNull();
		const mr = summarizeWebhook(headers({ "x-gitlab-event": "Merge Request Hook" }), JSON.stringify({
			project: { path_with_namespace: "g/r" },
			object_attributes: { action: "open", iid: 4, title: "Add login", url: "https://gitlab.com/g/r/-/merge_requests/4", source_branch: "login", target_branch: "main" },
		}));
		expect(mr.source).toBe("gitlab");
		expect(mr.summary).toContain("Merge request !4 open in g/r");
		expect(summarizeWebhook(headers({}), "deploy failed on prod").summary).toBe("deploy failed on prod");
		expect(summarizeWebhook(headers({}), JSON.stringify({ text: "Sentry: TypeError in checkout" })).summary).toBe("Sentry: TypeError in checkout");
	});
});

describe("webhook flow", () => {
	test("a delivery becomes a pending event that one device claims", async () => {
		const t = convexTest(schema, modules);
		await seed(t);
		const me = t.withIdentity(USER);
		const { token } = await me.mutation(api.kodeWebhooks.createWebhook, { name: "CI", projectPath: "/repo/app", projectName: "app", requireSignature: false });

		const ok = await t.fetch(`/kode/hooks/${token}`, { method: "POST", body: "build broke", headers: { "content-type": "text/plain" } });
		expect(ok.status).toBe(202);
		expect((await t.fetch("/kode/hooks/" + "0".repeat(48), { method: "POST", body: "x" })).status).toBe(404);

		const pending = await me.query(api.kodeWebhooks.pendingWebhookEvents, {});
		expect(pending).toHaveLength(1);
		expect(pending[0]).toMatchObject({ summary: "build broke", projectPath: "/repo/app", webhookName: "CI" });
		expect(await t.withIdentity(OTHER).query(api.kodeWebhooks.pendingWebhookEvents, {})).toHaveLength(0);

		expect(await me.mutation(api.kodeWebhooks.claimWebhookEvent, { eventId: pending[0]!.id, deviceId: "mac-1" })).toBe(true);
		expect(await me.mutation(api.kodeWebhooks.claimWebhookEvent, { eventId: pending[0]!.id, deviceId: "mac-2" })).toBe(false);
		expect(await me.query(api.kodeWebhooks.pendingWebhookEvents, {})).toHaveLength(0);
		await expect(t.withIdentity(OTHER).mutation(api.kodeWebhooks.claimWebhookEvent, { eventId: pending[0]!.id, deviceId: "x" })).rejects.toThrow();
	});

	test("turned-off webhooks don't queue events, and deleting removes them", async () => {
		const t = convexTest(schema, modules);
		await seed(t);
		const me = t.withIdentity(USER);
		const { id, token } = await me.mutation(api.kodeWebhooks.createWebhook, { name: "Off" });
		await me.mutation(api.kodeWebhooks.updateWebhook, { id, enabled: false });
		await t.fetch(`/kode/hooks/${token}`, { method: "POST", body: "x" });
		expect(await me.query(api.kodeWebhooks.pendingWebhookEvents, {})).toHaveLength(0);
		await me.mutation(api.kodeWebhooks.deleteWebhook, { id });
		expect(await me.query(api.kodeWebhooks.listWebhooks, {})).toHaveLength(0);
	});
});

describe("webhook signing and filters", () => {
	const body = new TextEncoder().encode('{"a":1}');

	test("checks GitHub, GitLab and Kode signatures", async () => {
		const sig = `sha256=${await hmacSha256Hex("s3cret", body)}`;
		expect(await checkSignature(headers({ "x-hub-signature-256": sig }), body, "s3cret")).toBe("ok");
		expect(await checkSignature(headers({ "x-hub-signature-256": sig }), body, "other")).toBe("bad_signature");
		expect(await checkSignature(headers({ "x-kode-signature": sig }), body, "s3cret")).toBe("ok");
		expect(await checkSignature(headers({ "x-gitlab-token": "s3cret" }), body, "s3cret")).toBe("ok");
		expect(await checkSignature(headers({ "x-gitlab-token": "nope" }), body, "s3cret")).toBe("bad_signature");
		expect(await checkSignature(headers({}), body, "s3cret")).toBe("unsigned");
		expect(await checkSignature(headers({ "x-hub-signature-256": sig }), body, null)).toBe("bad_signature");
	});

	test("filters by kind, branch and author", () => {
		const ci = { kind: "ci" as const, branch: "main", author: "octocat" };
		expect(filterReason(undefined, ci)).toBeNull();
		expect(filterReason({ kinds: ["issue"] }, ci)).toBe("kind");
		expect(filterReason({ kinds: ["ci"], branches: ["release/*"] }, ci)).toBe("branch");
		expect(filterReason({ branches: ["release/*"] }, { ...ci, branch: "release/1.2" })).toBeNull();
		expect(filterReason({ branches: ["main"] }, { kind: "issue", branch: null, author: "x" })).toBeNull();
		expect(filterReason({ authors: ["OctoCat"] }, ci)).toBeNull();
		expect(filterReason({ authors: ["someone"] }, ci)).toBe("author");
		expect(filterReason({ authors: ["someone"] }, { ...ci, author: null })).toBe("author");
	});

	test("a signed-only webhook rejects unsigned and forged deliveries", async () => {
		const t = convexTest(schema, modules);
		await seed(t);
		const me = t.withIdentity(USER);
		const { id, token } = await me.mutation(api.kodeWebhooks.createWebhook, { name: "GH", filters: { kinds: ["ci"] } });
		const [hook] = await me.query(api.kodeWebhooks.listWebhooks, {});
		expect(hook?.requireSignature).toBe(true);
		const secret = hook?.signingSecret as string;
		const payload = JSON.stringify({ action: "completed", repository: { full_name: "acme/app" }, workflow_run: { conclusion: "failure", name: "CI", head_branch: "main" } });
		const signed = `sha256=${await hmacSha256Hex(secret, new TextEncoder().encode(payload))}`;
		const send = (extra: Record<string, string>, event = "workflow_run") =>
			t.fetch(`/kode/hooks/${token}`, { method: "POST", body: payload, headers: { "content-type": "application/json", "x-github-event": event, ...extra } });

		expect((await send({})).status).toBe(401);
		expect((await send({ "x-hub-signature-256": "sha256=deadbeef" })).status).toBe(401);
		expect((await send({ "x-hub-signature-256": signed })).status).toBe(202);
		expect(await me.query(api.kodeWebhooks.pendingWebhookEvents, {})).toHaveLength(1);
		// Filtered by kind: a push is accepted but doesn't queue a thread.
		const push = JSON.stringify({ ref: "refs/heads/main" });
		const pushSig = `sha256=${await hmacSha256Hex(secret, new TextEncoder().encode(push))}`;
		const res = await t.fetch(`/kode/hooks/${token}`, { method: "POST", body: push, headers: { "x-github-event": "push", "x-hub-signature-256": pushSig } });
		expect(await res.text()).toContain("Filtered out");
		expect(await me.query(api.kodeWebhooks.pendingWebhookEvents, {})).toHaveLength(1);

		// Turning signing off lets unsigned deliveries through again.
		await me.mutation(api.kodeWebhooks.updateWebhook, { id, requireSignature: false });
		expect((await send({})).status).toBe(202);
	});
});
