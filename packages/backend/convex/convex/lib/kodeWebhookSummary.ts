// Turn a webhook delivery into a one-paragraph summary for a Kode thread.
// GitHub and GitLab events get readable summaries; anything else uses common
// fields (title / text / message) or a generic line.

export type WebhookSource = "github" | "gitlab" | "generic";

/** What kind of event this is, for per-webhook filters. */
export type WebhookKind = "ci" | "pull_request" | "review" | "issue" | "comment" | "push" | "other";

export const WEBHOOK_KINDS: WebhookKind[] = ["ci", "pull_request", "review", "issue", "comment", "push", "other"];

export type WebhookSummary = {
	source: WebhookSource;
	event: string;
	/** null = ignore this delivery (pings, events that need no action). */
	summary: string | null;
	kind: WebhookKind;
	/** Branch the event is about, when it has one. */
	branch: string | null;
	/** GitHub / GitLab username that caused it, when known. */
	author: string | null;
};

type Json = Record<string, any>;

const s = (value: unknown, max = 200): string =>
	typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

function github(event: string, body: Json): string | null {
	const repo = s(body.repository?.full_name) || "the repository";
	switch (event) {
		case "ping":
			return null;
		case "issues":
			if (!["opened", "reopened", "labeled"].includes(body.action)) return null;
			return `Issue #${body.issue?.number} ${body.action} in ${repo}: "${s(body.issue?.title)}" (${s(body.issue?.html_url)}).\n\n${s(body.issue?.body, 4000)}`;
		case "issue_comment":
			if (body.action !== "created") return null;
			return `New comment on #${body.issue?.number} "${s(body.issue?.title)}" in ${repo} by ${s(body.comment?.user?.login)} (${s(body.comment?.html_url)}):\n\n${s(body.comment?.body, 4000)}`;
		case "pull_request":
			if (!["opened", "reopened", "ready_for_review", "synchronize"].includes(body.action)) return null;
			return `Pull request #${body.pull_request?.number} ${body.action} in ${repo}: "${s(body.pull_request?.title)}" (${s(body.pull_request?.html_url)}), ${s(body.pull_request?.head?.ref)} → ${s(body.pull_request?.base?.ref)}.\n\n${s(body.pull_request?.body, 3000)}`;
		case "pull_request_review":
			if (body.review?.state !== "changes_requested") return null;
			return `Changes requested on PR #${body.pull_request?.number} "${s(body.pull_request?.title)}" in ${repo} by ${s(body.review?.user?.login)} (${s(body.review?.html_url)}):\n\n${s(body.review?.body, 3000)}`;
		case "workflow_run":
			if (body.action !== "completed" || body.workflow_run?.conclusion !== "failure") return null;
			return `CI failed in ${repo}: workflow "${s(body.workflow_run?.name)}" on ${s(body.workflow_run?.head_branch)} (${s(body.workflow_run?.html_url)}). Commit: "${s(body.workflow_run?.head_commit?.message)}".`;
		case "check_run":
			if (body.action !== "completed" || body.check_run?.conclusion !== "failure") return null;
			return `Check "${s(body.check_run?.name)}" failed in ${repo} (${s(body.check_run?.html_url)}).\n\n${s(body.check_run?.output?.summary, 2000)}`;
		case "push":
			return `Push to ${s(body.ref)} in ${repo} by ${s(body.pusher?.name)}: ${(body.commits ?? []).slice(0, 5).map((c: Json) => `"${s(c.message, 120)}"`).join(", ") || "no commits"}.`;
		default:
			return `GitHub event "${event}"${body.action ? ` (${s(body.action)})` : ""} in ${repo}.`;
	}
}

function gitlab(event: string, body: Json): string | null {
	const project = s(body.project?.path_with_namespace) || "the project";
	const attrs = body.object_attributes ?? {};
	switch (event) {
		case "Merge Request Hook":
			if (!["open", "reopen", "update"].includes(attrs.action)) return null;
			return `Merge request !${attrs.iid} ${attrs.action} in ${project}: "${s(attrs.title)}" (${s(attrs.url)}), ${s(attrs.source_branch)} → ${s(attrs.target_branch)}.\n\n${s(attrs.description, 3000)}`;
		case "Pipeline Hook":
			if (attrs.status !== "failed") return null;
			return `Pipeline #${attrs.id} failed in ${project} on ${s(attrs.ref)} (${s(body.commit?.url)}). Commit: "${s(body.commit?.message)}".`;
		case "Issue Hook":
			if (!["open", "reopen"].includes(attrs.action)) return null;
			return `Issue #${attrs.iid} opened in ${project}: "${s(attrs.title)}" (${s(attrs.url)}).\n\n${s(attrs.description, 4000)}`;
		case "Note Hook":
			return `New comment in ${project} by ${s(body.user?.username)} (${s(attrs.url)}):\n\n${s(attrs.note, 4000)}`;
		case "Push Hook":
			return `Push to ${s(body.ref)} in ${project} by ${s(body.user_name)}: ${(body.commits ?? []).slice(0, 5).map((c: Json) => `"${s(c.message, 120)}"`).join(", ") || "no commits"}.`;
		default:
			return `GitLab event "${event}" in ${project}.`;
	}
}

const stripRef = (ref: unknown) => (typeof ref === "string" && ref ? ref.replace(/^refs\/heads\//, "") : null);
const name = (value: unknown) => (typeof value === "string" && value ? value : null);

function githubMeta(event: string, body: Json): Pick<WebhookSummary, "kind" | "branch" | "author"> {
	switch (event) {
		case "workflow_run":
			return { kind: "ci", branch: stripRef(body.workflow_run?.head_branch), author: name(body.workflow_run?.actor?.login ?? body.sender?.login) };
		case "check_run":
			return { kind: "ci", branch: stripRef(body.check_run?.check_suite?.head_branch), author: name(body.sender?.login) };
		case "pull_request":
			return { kind: "pull_request", branch: stripRef(body.pull_request?.base?.ref), author: name(body.pull_request?.user?.login ?? body.sender?.login) };
		case "pull_request_review":
			return { kind: "review", branch: stripRef(body.pull_request?.base?.ref), author: name(body.review?.user?.login ?? body.sender?.login) };
		case "issues":
			return { kind: "issue", branch: null, author: name(body.issue?.user?.login ?? body.sender?.login) };
		case "issue_comment":
			return { kind: "comment", branch: null, author: name(body.comment?.user?.login ?? body.sender?.login) };
		case "push":
			return { kind: "push", branch: stripRef(body.ref), author: name(body.sender?.login ?? body.pusher?.name) };
		default:
			return { kind: "other", branch: null, author: name(body.sender?.login) };
	}
}

function gitlabMeta(event: string, body: Json): Pick<WebhookSummary, "kind" | "branch" | "author"> {
	const attrs = body.object_attributes ?? {};
	const user = name(body.user?.username ?? body.user_username);
	switch (event) {
		case "Pipeline Hook":
			return { kind: "ci", branch: stripRef(attrs.ref), author: user };
		case "Merge Request Hook":
			return { kind: "pull_request", branch: stripRef(attrs.target_branch), author: user };
		case "Issue Hook":
			return { kind: "issue", branch: null, author: user };
		case "Note Hook":
			return { kind: "comment", branch: null, author: user };
		case "Push Hook":
			return { kind: "push", branch: stripRef(body.ref), author: user };
		default:
			return { kind: "other", branch: null, author: user };
	}
}

export function summarizeWebhook(headers: (name: string) => string | null, raw: string): WebhookSummary {
	let body: Json = {};
	try {
		body = JSON.parse(raw) as Json;
	} catch {
		// Not JSON: the text itself is the message.
		const text = raw.trim().slice(0, 4000);
		return { source: "generic", event: "message", summary: text || null, kind: "other", branch: null, author: null };
	}
	const githubEvent = headers("x-github-event");
	if (githubEvent) return { source: "github", event: githubEvent, summary: github(githubEvent, body), ...githubMeta(githubEvent, body) };
	const gitlabEvent = headers("x-gitlab-event");
	if (gitlabEvent) return { source: "gitlab", event: gitlabEvent, summary: gitlab(gitlabEvent, body), ...gitlabMeta(gitlabEvent, body) };
	const text = s(body.text ?? body.message ?? body.title ?? body.summary ?? body.description, 4000);
	return {
		source: "generic",
		event: s(body.event ?? body.type, 60) || "webhook",
		summary: text || "A webhook fired (see the payload).",
		kind: "other",
		branch: stripRef(body.branch ?? body.ref),
		author: name(body.author ?? body.user),
	};
}
