// Turn a webhook delivery into a one-paragraph summary for a Kode thread.
// GitHub and GitLab events get readable summaries; anything else uses common
// fields (title / text / message) or a generic line.

export type WebhookSource = "github" | "gitlab" | "generic";

export type WebhookSummary = {
	source: WebhookSource;
	event: string;
	/** null = ignore this delivery (pings, events that need no action). */
	summary: string | null;
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

export function summarizeWebhook(headers: (name: string) => string | null, raw: string): WebhookSummary {
	let body: Json = {};
	try {
		body = JSON.parse(raw) as Json;
	} catch {
		// Not JSON: the text itself is the message.
		const text = raw.trim().slice(0, 4000);
		return { source: "generic", event: "message", summary: text || null };
	}
	const githubEvent = headers("x-github-event");
	if (githubEvent) return { source: "github", event: githubEvent, summary: github(githubEvent, body) };
	const gitlabEvent = headers("x-gitlab-event");
	if (gitlabEvent) return { source: "gitlab", event: gitlabEvent, summary: gitlab(gitlabEvent, body) };
	const text = s(body.text ?? body.message ?? body.title ?? body.summary ?? body.description, 4000);
	return { source: "generic", event: s(body.event ?? body.type, 60) || "webhook", summary: text || "A webhook fired (see the payload)." };
}
