import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { markdownToBlocks } from "@tryfabric/martian";
import { fetchMutation, fetchAction } from "convex/nextjs";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { deriveCapabilities } from "@repo/ai/lib/model-capabilities";
import { getAgent, type AgentId } from "@repo/ai/lib/agents";
import type { AiGatewayModel, OpenAIImageSize } from "./types";
import { modelSupportsTools } from "./model-utils";
import { toOpenAIImageSize } from "./request-utils";
import {
  userConnectorTokens,
  type ConnectorTokens,
} from "./connector-tokens";

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

/**
 * Build the create_task tool. The assistant calls this when the user clearly
 * expresses a task/reminder intent ("remind me to…", "I need to… by Friday").
 * It creates the task in Convex for the authenticated user and (optionally)
 * links it to the current chat. Requires a Convex auth token.
 */
function makeCreateTaskTool(
  convexToken: string,
  chatId: Id<"chats"> | null,
  userTimezone: string | null,
) {
  return tool({
    description: [
      "Create a task or reminder in the user's Kontinue task list.",
      "",
      "Call this when the user expresses a clear actionable intent, e.g.:",
      "- 'Remind me to deploy on Friday'",
      "- 'I need to call the investor tomorrow'",
      "- 'Add a task to finish the landing page next week'",
      "",
      "CONFIRMATION: If the intent or timing is ambiguous (you cannot confidently",
      "determine a title or due date), DO NOT call this tool — instead ask one",
      "short clarifying question first. Only create the task when confident.",
      "",
      "DUE DATES: Resolve relative dates ('tomorrow', 'Friday', 'next week') to an",
      "absolute ISO 8601 datetime using the CURRENT TIME provided in your context",
      "(do NOT call get_current_time for this). Omit dueDateIso when the user gives no timing.",
      "",
      "After creating, briefly confirm in one sentence (e.g. 'Done — I'll remind you tomorrow at 3 PM'). Do not show a clock widget.",
    ].join("\n"),
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .max(200)
        .describe("Short imperative task title, e.g. 'Deploy to production'."),
      description: z
        .string()
        .max(2000)
        .optional()
        .describe("Optional extra detail or context for the task."),
      dueDateIso: z
        .string()
        .optional()
        .describe(
          "Absolute ISO 8601 datetime for when the task is due. Resolve relative phrases yourself. Omit if no timing was given.",
        ),
      priority: z
        .enum(TASK_PRIORITIES)
        .optional()
        .describe("Task priority. Default 'medium'. Use 'urgent' only when explicitly time-critical."),
      reminderMinutesBefore: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Minutes before the due date to send a reminder (e.g. 60 for 1 hour). Only set when a due date is present.",
        ),
    }),
    execute: async ({
      title,
      description,
      dueDateIso,
      priority,
      reminderMinutesBefore,
    }) => {
      const dueDate = resolveDueDate(dueDateIso, userTimezone);
      try {
        await fetchMutation(
          convexApi.tasks.createTask,
          {
            title,
            description,
            dueDate,
            priority: priority ?? "medium",
            reminderMinutesBefore:
              dueDate != null ? reminderMinutesBefore : undefined,
            linkedConversationId: chatId ?? undefined,
            createdByAgent: "chat",
          },
          { token: convexToken },
        );
        return {
          success: true,
          title,
          dueDate: dueDate ?? null,
          priority: priority ?? "medium",
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to create task",
        };
      }
    },
  });
}

/**
 * Build the github tool. Available when the user has connected GitHub. Fetches
 * the decrypted access token from Convex (owner-scoped) and queries the GitHub
 * REST API on the user's behalf. Read-only: repos and issues.
 */
function makeGithubTool(tokens: ConnectorTokens) {
  const API = "https://api.github.com";
  return tool({
    description: [
      "Read AND modify the user's connected GitHub account (full repo scope,",
      "including private repos).",
      "",
      "Read actions:",
      "- list_repos: ALL the user's repos (owned + collaborator + org), with the",
      "  true total count. Use perPage/limit only to cap what's returned, not the count.",
      "- get_repo: details for one repo (needs repo).",
      "- list_issues: issues in a repo (state defaults to open).",
      "- list_pull_requests: pull requests in a repo (state defaults to open).",
      "- list_branches: branches in a repo.",
      "- list_commits: recent commits (optionally on a branch / path).",
      "- get_file: read a file's text content (needs repo + path; optional branch).",
      "- search_code: search code across the user's repos (needs query).",
      "",
      "Write actions:",
      "- create_issue / update_issue / close_issue / reopen_issue / comment_issue.",
      "- create_or_update_file: commit a file (needs repo, path, content, message;",
      "  optional branch). Creates the file or updates it in place.",
      "- create_branch: make a new branch (needs repo, branch; from baseBranch).",
      "- create_pull_request: open a PR (needs repo, title, head, base).",
      "",
      "You usually need an id/number first — call list_* to find it, then act. For",
      "write/destructive actions confirm an ambiguous target with the user first,",
      "then perform it. Only works if GitHub is connected in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum([
          "list_repos",
          "get_repo",
          "list_issues",
          "list_pull_requests",
          "list_branches",
          "list_commits",
          "get_file",
          "search_code",
          "create_issue",
          "update_issue",
          "close_issue",
          "reopen_issue",
          "comment_issue",
          "create_or_update_file",
          "create_branch",
          "create_pull_request",
        ])
        .describe("The GitHub operation to perform."),
      repo: z
        .string()
        .optional()
        .describe("Repository as 'owner/name' (e.g. 'vercel/next.js'). Required for everything except list_repos and search_code."),
      title: z
        .string()
        .optional()
        .describe("For create_issue/update_issue/create_pull_request: the title."),
      body: z
        .string()
        .optional()
        .describe("Issue/PR body, or the comment text for comment_issue."),
      issueNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("For issue actions: the issue (or PR) number."),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("For list_issues/list_pull_requests: filter by state (default open)."),
      labels: z
        .array(z.string())
        .optional()
        .describe("For create_issue/update_issue: labels to set."),
      path: z
        .string()
        .optional()
        .describe("For get_file/create_or_update_file: the file path within the repo."),
      content: z
        .string()
        .optional()
        .describe("For create_or_update_file: the new file content (plain text)."),
      message: z
        .string()
        .optional()
        .describe("For create_or_update_file: the commit message."),
      branch: z
        .string()
        .optional()
        .describe("For get_file/list_commits/create_or_update_file: the branch/ref. For create_branch: the NEW branch name."),
      baseBranch: z
        .string()
        .optional()
        .describe("For create_branch: the branch to fork from (defaults to the repo's default branch)."),
      head: z
        .string()
        .optional()
        .describe("For create_pull_request: the branch containing your changes."),
      base: z
        .string()
        .optional()
        .describe("For create_pull_request: the branch to merge into (e.g. 'main')."),
      query: z
        .string()
        .optional()
        .describe("For search_code: the code search query."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max items to RETURN for list actions (default 30). Does not affect list_repos' total count."),
    }),
    execute: async ({
      action,
      repo,
      title,
      body,
      issueNumber,
      state,
      labels,
      path,
      content,
      message,
      branch,
      baseBranch,
      head,
      base,
      query,
      limit,
    }) => {
      try {
        const tokenResult = await tokens.getAccessToken("github");
        if (!tokenResult) {
          return { connected: false, error: "GitHub is not connected." };
        }
        const headers = {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "KontinueAI",
        };
        const apiError = async (res: Response) => ({
          connected: true as const,
          error: `GitHub API error ${res.status}: ${await res.text()}`,
        });
        const needRepo = () =>
          !repo || !repo.includes("/")
            ? "Provide repo as 'owner/name' for this action."
            : null;

        if (action === "list_repos") {
          // Paginate fully so the COUNT is accurate (the old code capped at 10).
          const all: Array<{
            full_name: string;
            description: string | null;
            private: boolean;
            html_url: string;
            updated_at: string;
            stargazers_count?: number;
          }> = [];
          for (let page = 1; page <= 10; page++) {
            const res = await fetch(
              `${API}/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
              { headers },
            );
            if (!res.ok) return apiError(res);
            const batch = (await res.json()) as typeof all;
            all.push(...batch);
            if (batch.length < 100) break; // last page
          }
          const cap = limit ?? 30;
          return {
            connected: true,
            totalCount: all.length,
            returned: Math.min(all.length, cap),
            repos: all.slice(0, cap).map((r) => ({
              fullName: r.full_name,
              description: r.description,
              private: r.private,
              stars: r.stargazers_count,
              url: r.html_url,
              updatedAt: r.updated_at,
            })),
          };
        }

        if (action === "search_code") {
          if (!query) return { connected: true, error: "query is required for search_code." };
          const res = await fetch(
            `${API}/search/code?q=${encodeURIComponent(query)}&per_page=${limit ?? 20}`,
            { headers },
          );
          if (!res.ok) return apiError(res);
          const data = (await res.json()) as {
            total_count: number;
            items: Array<{ name: string; path: string; html_url: string; repository?: { full_name?: string } }>;
          };
          return {
            connected: true,
            totalCount: data.total_count,
            results: data.items.map((i) => ({
              name: i.name,
              path: i.path,
              repo: i.repository?.full_name,
              url: i.html_url,
            })),
          };
        }

        const repoErr = needRepo();
        if (repoErr) return { connected: true, error: repoErr };

        if (action === "get_repo") {
          const res = await fetch(`${API}/repos/${repo}`, { headers });
          if (!res.ok) return apiError(res);
          const r = (await res.json()) as {
            full_name: string;
            description: string | null;
            private: boolean;
            default_branch: string;
            html_url: string;
            stargazers_count: number;
            open_issues_count: number;
            language: string | null;
          };
          return {
            connected: true,
            repo: {
              fullName: r.full_name,
              description: r.description,
              private: r.private,
              defaultBranch: r.default_branch,
              stars: r.stargazers_count,
              openIssues: r.open_issues_count,
              language: r.language,
              url: r.html_url,
            },
          };
        }

        if (action === "list_issues") {
          const res = await fetch(
            `${API}/repos/${repo}/issues?state=${state ?? "open"}&per_page=${limit ?? 30}`,
            { headers },
          );
          if (!res.ok) return apiError(res);
          const issues = (await res.json()) as Array<{
            number: number;
            title: string;
            html_url: string;
            state: string;
            pull_request?: unknown;
          }>;
          return {
            connected: true,
            repo,
            // The issues endpoint also returns PRs; filter them out.
            issues: issues
              .filter((i) => !i.pull_request)
              .map((i) => ({ number: i.number, title: i.title, url: i.html_url, state: i.state })),
          };
        }

        if (action === "list_pull_requests") {
          const res = await fetch(
            `${API}/repos/${repo}/pulls?state=${state ?? "open"}&per_page=${limit ?? 30}`,
            { headers },
          );
          if (!res.ok) return apiError(res);
          const prs = (await res.json()) as Array<{
            number: number;
            title: string;
            html_url: string;
            state: string;
            draft?: boolean;
            head?: { ref?: string };
            base?: { ref?: string };
          }>;
          return {
            connected: true,
            repo,
            pullRequests: prs.map((p) => ({
              number: p.number,
              title: p.title,
              url: p.html_url,
              state: p.state,
              draft: p.draft ?? false,
              head: p.head?.ref,
              base: p.base?.ref,
            })),
          };
        }

        if (action === "list_branches") {
          const res = await fetch(
            `${API}/repos/${repo}/branches?per_page=${limit ?? 50}`,
            { headers },
          );
          if (!res.ok) return apiError(res);
          const branches = (await res.json()) as Array<{
            name: string;
            protected?: boolean;
          }>;
          return {
            connected: true,
            repo,
            branches: branches.map((b) => ({ name: b.name, protected: b.protected ?? false })),
          };
        }

        if (action === "list_commits") {
          const url = new URL(`${API}/repos/${repo}/commits`);
          url.searchParams.set("per_page", String(limit ?? 20));
          if (branch) url.searchParams.set("sha", branch);
          if (path) url.searchParams.set("path", path);
          const res = await fetch(url, { headers });
          if (!res.ok) return apiError(res);
          const commits = (await res.json()) as Array<{
            sha: string;
            html_url: string;
            commit: { message: string; author?: { name?: string; date?: string } };
          }>;
          return {
            connected: true,
            repo,
            commits: commits.map((c) => ({
              sha: c.sha.slice(0, 7),
              message: c.commit.message.split("\n")[0],
              author: c.commit.author?.name,
              date: c.commit.author?.date,
              url: c.html_url,
            })),
          };
        }

        if (action === "get_file") {
          if (!path) return { connected: true, error: "path is required for get_file." };
          const url = new URL(`${API}/repos/${repo}/contents/${path}`);
          if (branch) url.searchParams.set("ref", branch);
          const res = await fetch(url, { headers });
          if (!res.ok) return apiError(res);
          const data = (await res.json()) as {
            content?: string;
            encoding?: string;
            sha: string;
            html_url: string;
            size: number;
          };
          const text =
            data.encoding === "base64" && data.content
              ? Buffer.from(data.content, "base64").toString("utf8")
              : "";
          return {
            connected: true,
            repo,
            path,
            sha: data.sha,
            url: data.html_url,
            content: text.slice(0, 12000),
            truncated: text.length > 12000,
          };
        }

        if (action === "create_issue") {
          if (!title) return { connected: true, error: "A title is required to create an issue." };
          const res = await fetch(`${API}/repos/${repo}/issues`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title, body: body ?? "", labels: labels ?? undefined }),
          });
          if (!res.ok) return apiError(res);
          const issue = (await res.json()) as { number: number; html_url: string };
          return { connected: true, created: true, number: issue.number, url: issue.html_url };
        }

        if (action === "update_issue") {
          if (!issueNumber) return { connected: true, error: "issueNumber is required to update an issue." };
          const patch: Record<string, unknown> = {};
          if (title !== undefined) patch.title = title;
          if (body !== undefined) patch.body = body;
          if (labels !== undefined) patch.labels = labels;
          if (Object.keys(patch).length === 0) {
            return { connected: true, error: "Provide title, body or labels to update." };
          }
          const res = await fetch(`${API}/repos/${repo}/issues/${issueNumber}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(patch),
          });
          if (!res.ok) return apiError(res);
          return { connected: true, updated: true, number: issueNumber };
        }

        if (action === "close_issue" || action === "reopen_issue") {
          if (!issueNumber) return { connected: true, error: "issueNumber is required." };
          const res = await fetch(`${API}/repos/${repo}/issues/${issueNumber}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ state: action === "close_issue" ? "closed" : "open" }),
          });
          if (!res.ok) return apiError(res);
          return {
            connected: true,
            number: issueNumber,
            state: action === "close_issue" ? "closed" : "open",
          };
        }

        if (action === "comment_issue") {
          if (!issueNumber || !body) {
            return { connected: true, error: "issueNumber and body are required to comment." };
          }
          const res = await fetch(
            `${API}/repos/${repo}/issues/${issueNumber}/comments`,
            { method: "POST", headers, body: JSON.stringify({ body }) },
          );
          if (!res.ok) return apiError(res);
          const comment = (await res.json()) as { html_url: string };
          return { connected: true, commented: true, url: comment.html_url };
        }

        if (action === "create_branch") {
          if (!branch) return { connected: true, error: "branch (the new name) is required." };
          // Resolve the base branch to its head commit sha.
          let from = baseBranch;
          if (!from) {
            const repoRes = await fetch(`${API}/repos/${repo}`, { headers });
            if (!repoRes.ok) return apiError(repoRes);
            from = ((await repoRes.json()) as { default_branch: string }).default_branch;
          }
          const refRes = await fetch(
            `${API}/repos/${repo}/git/ref/heads/${from}`,
            { headers },
          );
          if (!refRes.ok) return apiError(refRes);
          const sha = ((await refRes.json()) as { object: { sha: string } }).object.sha;
          const res = await fetch(`${API}/repos/${repo}/git/refs`, {
            method: "POST",
            headers,
            body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
          });
          if (!res.ok) return apiError(res);
          return { connected: true, created: true, branch, from };
        }

        if (action === "create_or_update_file") {
          if (!path || content === undefined || !message) {
            return { connected: true, error: "path, content and message are required." };
          }
          // Look up the existing file's sha (required to update in place).
          let sha: string | undefined;
          const getUrl = new URL(`${API}/repos/${repo}/contents/${path}`);
          if (branch) getUrl.searchParams.set("ref", branch);
          const getRes = await fetch(getUrl, { headers });
          if (getRes.ok) {
            sha = ((await getRes.json()) as { sha?: string }).sha;
          }
          const res = await fetch(`${API}/repos/${repo}/contents/${path}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message,
              content: Buffer.from(content, "utf8").toString("base64"),
              branch: branch || undefined,
              sha,
            }),
          });
          if (!res.ok) return apiError(res);
          const data = (await res.json()) as {
            content?: { html_url?: string };
            commit?: { html_url?: string };
          };
          return {
            connected: true,
            committed: true,
            updated: Boolean(sha),
            path,
            url: data.content?.html_url,
            commitUrl: data.commit?.html_url,
          };
        }

        // create_pull_request
        if (!title || !head || !base) {
          return { connected: true, error: "title, head and base are required to open a PR." };
        }
        const res = await fetch(`${API}/repos/${repo}/pulls`, {
          method: "POST",
          headers,
          body: JSON.stringify({ title, head, base, body: body ?? "" }),
        });
        if (!res.ok) return apiError(res);
        const pr = (await res.json()) as { number: number; html_url: string };
        return { connected: true, created: true, number: pr.number, url: pr.html_url };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "GitHub request failed",
        };
      }
    },
  });
}

/**
 * Build the notion tool. Searches the user's connected Notion workspace.
 */
// Notion accepts at most 100 child blocks per request.
const NOTION_MAX_CHILDREN = 100;

// Convert the model's markdown into real Notion blocks (headings, lists,
// bold/italic/code, links, quotes, code blocks) instead of dumping literal
// "#", "*", "-" characters into a plain paragraph.
function markdownToNotionBlocks(text: string): Record<string, unknown>[] {
  if (!text.trim()) return [];
  return markdownToBlocks(text, {
    notionLimits: { truncate: true },
  }) as unknown as Record<string, unknown>[];
}

async function notionAppendChildren(
  pageId: string,
  blocks: Record<string, unknown>[],
  headers: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let i = 0; i < blocks.length; i += NOTION_MAX_CHILDREN) {
    const chunk = blocks.slice(i, i + NOTION_MAX_CHILDREN);
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      { method: "PATCH", headers, body: JSON.stringify({ children: chunk }) },
    );
    if (!res.ok) {
      return { ok: false, error: `Notion API error ${res.status}: ${await res.text()}` };
    }
  }
  return { ok: true };
}

function makeNotionTool(tokens: ConnectorTokens) {
  return tool({
    description: [
      "Read AND write the user's connected Notion workspace — both free-form pages",
      "and structured databases (task trackers, CRMs, content calendars, etc.).",
      "",
      "Page actions:",
      "- search: find pages AND databases by title (empty query returns recent items).",
      "- read: read the full text content of a page (needs pageId).",
      "- create_page: create a new page under a parent page (needs parentPageId).",
      "- append: add content to the end of an existing page (needs pageId).",
      "",
      "Database actions:",
      "- get_database: read a database's property schema (needs databaseId). Call this",
      "  FIRST before writing to a database so you know the exact property names and",
      "  the allowed options for select/status properties.",
      "- query_database: list rows of a database (needs databaseId). Optionally pass a",
      "  raw Notion `notionFilter` object and/or `notionSorts` array.",
      "- create_database_item: add a row to a database (needs databaseId + properties).",
      "- update_page: change properties on an existing page/row (needs pageId +",
      "  properties), or pass archived=true to delete (archive) it.",
      "",
      "PROPERTIES: pass `properties` as a simple flat object of { propertyName: value }",
      "matching the database schema, e.g. { \"Name\": \"Ship v2\", \"Status\": \"In progress\",",
      "\"Due\": \"2026-06-12\", \"Done\": false, \"Tags\": [\"urgent\",\"backend\"] }. Use a string",
      "for title/text/select/status/url/email, a number for number, a boolean for",
      "checkbox, an ISO date string for date, and an array of strings for multi_select.",
      "It is translated to Notion's typed property format automatically.",
      "",
      "To act on something you usually need its id first — call search / query_database",
      "to find it, then read/append/update with its id.",
      "",
      "CONTENT FORMATTING: write the `content` field as normal Markdown — use #/##/### for",
      "headings, -/1. for lists, **bold**, *italic*, `code`, > quotes, ```code fences```,",
      "and [text](url) links. It is converted to native Notion blocks automatically, so",
      "the user sees proper Notion headings/lists/links — NOT raw '#' or '*' characters.",
      "If Notion is not connected, tell the user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum([
          "search",
          "read",
          "create_page",
          "append",
          "get_database",
          "query_database",
          "create_database_item",
          "update_page",
        ])
        .describe("The Notion operation to perform."),
      query: z
        .string()
        .optional()
        .describe("For search: text to match page/database titles. Empty returns recent items."),
      parentPageId: z
        .string()
        .optional()
        .describe("For create_page: the id of the parent page to nest the new page under."),
      pageId: z
        .string()
        .optional()
        .describe("For append/update_page: the id of the page (or database row) to act on."),
      databaseId: z
        .string()
        .optional()
        .describe("For get_database/query_database/create_database_item: the database id."),
      title: z
        .string()
        .optional()
        .describe("For create_page: the new page's title."),
      content: z
        .string()
        .optional()
        .describe(
          "For create_page/append: body as Markdown (headings, lists, bold/italic/code, links, quotes, code blocks). Converted to native Notion blocks — never include raw markup the user shouldn't see.",
        ),
      properties: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          "For create_database_item/update_page: flat { propertyName: value } object matching the database schema. See PROPERTIES in the tool description.",
        ),
      notionFilter: z
        .any()
        .optional()
        .describe("For query_database: a raw Notion filter object (optional). See Notion API filter docs."),
      notionSorts: z
        .any()
        .optional()
        .describe("For query_database: a raw Notion sorts array (optional)."),
      archived: z
        .boolean()
        .optional()
        .describe("For update_page: set true to archive (delete) the page/row."),
    }),
    execute: async ({
      action,
      query,
      parentPageId,
      pageId,
      databaseId,
      title,
      content,
      properties,
      notionFilter,
      notionSorts,
      archived,
    }) => {
      try {
        const tokenResult = await tokens.getAccessToken("notion");
        if (!tokenResult) return { connected: false, error: "Notion is not connected." };
        const headers = {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        };

        if (action === "search") {
          // No object filter — return BOTH pages and databases so the model can
          // discover a database id (for query_database / create_database_item).
          const res = await fetch("https://api.notion.com/v1/search", {
            method: "POST",
            headers,
            body: JSON.stringify({ query: query ?? "", page_size: 10 }),
          });
          if (!res.ok) return { connected: true, error: `Notion API error ${res.status}` };
          const data = (await res.json()) as {
            results: Array<{
              id: string;
              object?: string;
              url?: string;
              title?: Array<{ plain_text?: string }>;
              properties?: Record<string, unknown>;
            }>;
          };
          return {
            connected: true,
            results: data.results.map((p) => ({
              id: p.id,
              // Databases carry a top-level `title` array; pages carry a title
              // property inside `properties`.
              type: p.object === "database" ? "database" : "page",
              url: p.url,
              title:
                p.object === "database"
                  ? (p.title ?? []).map((t) => t.plain_text ?? "").join("") ||
                    "Untitled"
                  : extractNotionTitle(p.properties),
            })),
          };
        }

        if (action === "read") {
          if (!pageId)
            return { connected: true, error: "pageId is required to read a page." };
          // Page title (best-effort).
          let pageTitle: string | undefined;
          try {
            const pageRes = await fetch(
              `https://api.notion.com/v1/pages/${pageId}`,
              { headers },
            );
            if (pageRes.ok) {
              const page = (await pageRes.json()) as {
                properties?: Record<string, unknown>;
              };
              pageTitle = extractNotionTitle(page.properties);
            }
          } catch {
            /* title is cosmetic */
          }

          // Walk the block children (paginated) and pull out readable text.
          const lines: string[] = [];
          let cursor: string | undefined;
          let guard = 0;
          do {
            const url = new URL(
              `https://api.notion.com/v1/blocks/${pageId}/children`,
            );
            url.searchParams.set("page_size", "100");
            if (cursor) url.searchParams.set("start_cursor", cursor);
            const res = await fetch(url, { headers });
            if (!res.ok)
              return {
                connected: true,
                error: `Notion API error ${res.status}: ${await res.text()}`,
              };
            const data = (await res.json()) as {
              results: Array<Record<string, unknown>>;
              has_more?: boolean;
              next_cursor?: string | null;
            };
            for (const block of data.results) {
              const text = extractNotionBlockText(block);
              if (text) lines.push(text);
            }
            cursor = data.has_more ? data.next_cursor ?? undefined : undefined;
          } while (cursor && ++guard < 10);

          return {
            connected: true,
            pageId,
            title: pageTitle,
            content: lines.join("\n").slice(0, 12000),
          };
        }

        if (action === "create_page") {
          if (!parentPageId || !title) {
            return { connected: true, error: "parentPageId and title are required to create a page." };
          }
          const blocks = content ? markdownToNotionBlocks(content) : [];
          const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers,
            body: JSON.stringify({
              parent: { page_id: parentPageId },
              properties: {
                title: { title: [{ type: "text", text: { content: title } }] },
              },
              // Notion caps children at 100 per request; send the first 100 here
              // and append the rest in follow-up batches below.
              children: blocks.slice(0, NOTION_MAX_CHILDREN),
            }),
          });
          if (!res.ok) return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
          const page = (await res.json()) as { id: string; url?: string };
          if (blocks.length > NOTION_MAX_CHILDREN) {
            const rest = await notionAppendChildren(
              page.id,
              blocks.slice(NOTION_MAX_CHILDREN),
              headers,
            );
            if (!rest.ok) return { connected: true, error: rest.error };
          }
          return { connected: true, created: true, id: page.id, url: page.url };
        }

        if (action === "append") {
          if (!pageId || !content) {
            return { connected: true, error: "pageId and content are required to append." };
          }
          const appendResult = await notionAppendChildren(
            pageId,
            markdownToNotionBlocks(content),
            headers,
          );
          if (!appendResult.ok) return { connected: true, error: appendResult.error };
          return { connected: true, appended: true, pageId };
        }

        if (action === "get_database") {
          if (!databaseId) {
            return { connected: true, error: "databaseId is required for get_database." };
          }
          const res = await fetch(
            `https://api.notion.com/v1/databases/${databaseId}`,
            { headers },
          );
          if (!res.ok)
            return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
          const db = (await res.json()) as {
            title?: Array<{ plain_text?: string }>;
            properties?: Record<string, NotionPropSchema>;
          };
          return {
            connected: true,
            databaseId,
            title: (db.title ?? []).map((t) => t.plain_text ?? "").join("") || "Untitled",
            schema: summarizeNotionSchema(db.properties),
          };
        }

        if (action === "query_database") {
          if (!databaseId) {
            return { connected: true, error: "databaseId is required for query_database." };
          }
          const body: Record<string, unknown> = { page_size: 25 };
          if (notionFilter) body.filter = notionFilter;
          if (notionSorts) body.sorts = notionSorts;
          const res = await fetch(
            `https://api.notion.com/v1/databases/${databaseId}/query`,
            { method: "POST", headers, body: JSON.stringify(body) },
          );
          if (!res.ok)
            return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
          const data = (await res.json()) as {
            results: Array<{
              id: string;
              url?: string;
              properties?: Record<string, unknown>;
            }>;
          };
          return {
            connected: true,
            databaseId,
            rows: data.results.map((r) => ({
              id: r.id,
              url: r.url,
              properties: simplifyNotionProperties(r.properties),
            })),
          };
        }

        if (action === "create_database_item") {
          if (!databaseId || !properties) {
            return {
              connected: true,
              error: "databaseId and properties are required to create a database item.",
            };
          }
          const built = await buildNotionPropertiesFromDb(
            databaseId,
            properties,
            headers,
          );
          if ("error" in built) return { connected: true, error: built.error };
          const blocks = content ? markdownToNotionBlocks(content) : [];
          const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers,
            body: JSON.stringify({
              parent: { database_id: databaseId },
              properties: built.properties,
              children: blocks.slice(0, NOTION_MAX_CHILDREN),
            }),
          });
          if (!res.ok)
            return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
          const page = (await res.json()) as { id: string; url?: string };
          if (blocks.length > NOTION_MAX_CHILDREN) {
            const rest = await notionAppendChildren(
              page.id,
              blocks.slice(NOTION_MAX_CHILDREN),
              headers,
            );
            if (!rest.ok) return { connected: true, error: rest.error };
          }
          return { connected: true, created: true, id: page.id, url: page.url };
        }

        // update_page
        if (!pageId) {
          return { connected: true, error: "pageId is required to update a page." };
        }
        const patch: Record<string, unknown> = {};
        if (archived === true) patch.archived = true;
        if (properties && Object.keys(properties).length > 0) {
          // Look up the parent database (if any) so we can type the properties.
          const pageRes = await fetch(
            `https://api.notion.com/v1/pages/${pageId}`,
            { headers },
          );
          if (!pageRes.ok)
            return { connected: true, error: `Notion API error ${pageRes.status}: ${await pageRes.text()}` };
          const page = (await pageRes.json()) as {
            parent?: { database_id?: string };
          };
          const dbId = page.parent?.database_id;
          if (!dbId) {
            return {
              connected: true,
              error: "This page is not a database row, so it has no editable properties. Use append to add content instead.",
            };
          }
          const built = await buildNotionPropertiesFromDb(dbId, properties, headers);
          if ("error" in built) return { connected: true, error: built.error };
          patch.properties = built.properties;
        }
        if (Object.keys(patch).length === 0) {
          return { connected: true, error: "Nothing to update — provide properties or archived." };
        }
        const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        });
        if (!res.ok)
          return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
        return {
          connected: true,
          updated: true,
          id: pageId,
          archived: archived === true,
        };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Notion request failed",
        };
      }
    },
  });
}

// Pull readable plain text out of a Notion block. Handles the common text-
// bearing block types; prefixes list items / headings / todos so the rendered
// text stays legible. Unknown block types contribute nothing.
function extractNotionBlockText(block: Record<string, unknown>): string {
  const type = block.type as string | undefined;
  if (!type) return "";
  const body = block[type] as
    | { rich_text?: Array<{ plain_text?: string }>; checked?: boolean }
    | undefined;
  const rich = body?.rich_text;
  const text = Array.isArray(rich)
    ? rich.map((t) => t.plain_text ?? "").join("")
    : "";
  if (!text) return "";
  switch (type) {
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `- [${body?.checked ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return `\`\`\`\n${text}\n\`\`\``;
    default:
      return text;
  }
}

// Notion page titles live in a title-typed property; dig the plain text out.
function extractNotionTitle(props?: Record<string, unknown>): string {
  if (!props) return "Untitled";
  for (const value of Object.values(props)) {
    const prop = value as {
      type?: string;
      title?: Array<{ plain_text?: string }>;
    };
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t.plain_text ?? "").join("").trim();
      if (text) return text;
    }
  }
  return "Untitled";
}

// ── Notion database helpers ──────────────────────────────────────────────────

type NotionPropSchema = {
  type: string;
  select?: { options?: Array<{ name: string }> };
  status?: { options?: Array<{ name: string }> };
  multi_select?: { options?: Array<{ name: string }> };
};

// Condense a database's property schema into a compact { name: {type, options} }
// map so the model knows valid property names and select/status choices before
// writing — without dumping Notion's verbose schema payload into the context.
function summarizeNotionSchema(
  props?: Record<string, NotionPropSchema>,
): Record<string, { type: string; options?: string[] }> {
  const out: Record<string, { type: string; options?: string[] }> = {};
  if (!props) return out;
  for (const [name, def] of Object.entries(props)) {
    const options =
      def.select?.options ??
      def.status?.options ??
      def.multi_select?.options;
    out[name] = {
      type: def.type,
      ...(options ? { options: options.map((o) => o.name) } : {}),
    };
  }
  return out;
}

// Flatten Notion's typed property values on a returned row into plain readable
// values ({ Name: "Ship v2", Status: "Done", Due: "2026-06-12", Tags: [...] }).
function simplifyNotionProperties(
  props?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props) return out;
  for (const [name, raw] of Object.entries(props)) {
    const p = raw as Record<string, any>;
    switch (p?.type) {
      case "title":
      case "rich_text":
        out[name] = (p[p.type] as Array<{ plain_text?: string }>)
          ?.map((t) => t.plain_text ?? "")
          .join("");
        break;
      case "number":
        out[name] = p.number;
        break;
      case "checkbox":
        out[name] = p.checkbox;
        break;
      case "select":
        out[name] = p.select?.name ?? null;
        break;
      case "status":
        out[name] = p.status?.name ?? null;
        break;
      case "multi_select":
        out[name] = (p.multi_select as Array<{ name: string }>)?.map((o) => o.name);
        break;
      case "date":
        out[name] = p.date?.start ?? null;
        break;
      case "url":
      case "email":
      case "phone_number":
        out[name] = p[p.type];
        break;
      case "people":
        out[name] = (p.people as Array<{ name?: string }>)?.map((x) => x.name);
        break;
      default:
        // Skip types we don't model (formula, rollup, relation, files…).
        break;
    }
  }
  return out;
}

// Translate a flat { propertyName: value } object into Notion's typed property
// payload, using the database schema to decide each property's shape. Fetches
// the schema itself so callers only pass simple values.
async function buildNotionPropertiesFromDb(
  databaseId: string,
  simple: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ properties: Record<string, unknown> } | { error: string }> {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${databaseId}`,
    { headers },
  );
  if (!res.ok) {
    return { error: `Notion API error ${res.status}: ${await res.text()}` };
  }
  const db = (await res.json()) as {
    properties?: Record<string, NotionPropSchema>;
  };
  const schema = db.properties ?? {};

  const properties: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(simple)) {
    if (value == null) continue;
    const def = schema[name];
    if (!def) continue; // ignore properties the database doesn't have
    switch (def.type) {
      case "title":
        properties[name] = { title: [{ text: { content: String(value) } }] };
        break;
      case "rich_text":
        properties[name] = { rich_text: [{ text: { content: String(value) } }] };
        break;
      case "number":
        properties[name] = { number: Number(value) };
        break;
      case "checkbox":
        properties[name] = { checkbox: Boolean(value) };
        break;
      case "select":
        properties[name] = { select: { name: String(value) } };
        break;
      case "status":
        properties[name] = { status: { name: String(value) } };
        break;
      case "multi_select": {
        const arr = Array.isArray(value)
          ? value
          : String(value).split(",").map((s) => s.trim());
        properties[name] = {
          multi_select: arr.filter(Boolean).map((name) => ({ name: String(name) })),
        };
        break;
      }
      case "date":
        properties[name] = { date: { start: String(value) } };
        break;
      case "url":
        properties[name] = { url: String(value) };
        break;
      case "email":
        properties[name] = { email: String(value) };
        break;
      case "phone_number":
        properties[name] = { phone_number: String(value) };
        break;
      default:
        // Unsupported type (formula/rollup/relation/people) — skip silently.
        break;
    }
  }
  return { properties };
}

/**
 * Build the vercel tool. Lists the user's recent deployments.
 */
function makeVercelTool(tokens: ConnectorTokens) {
  return tool({
    description: [
      "Read AND act on the user's connected Vercel account.",
      "",
      "Actions:",
      "- list_deployments: recent deployments (with their ids).",
      "- redeploy: re-deploy an existing deployment by id (reuses its build).",
      "",
      "To redeploy, first call list_deployments to get a deploymentId, then confirm",
      "with the user before redeploying. If Vercel is not connected, tell the user",
      "to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum(["list_deployments", "redeploy"])
        .optional()
        .describe("Operation to perform. Defaults to list_deployments."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("For list_deployments: how many to return (default 10)."),
      deploymentId: z
        .string()
        .optional()
        .describe("For redeploy: the id (uid) of the deployment to re-deploy."),
      name: z
        .string()
        .optional()
        .describe("For redeploy: the project name the deployment belongs to."),
      target: z
        .enum(["production", "staging"])
        .optional()
        .describe("For redeploy: deploy target (default production)."),
    }),
    execute: async ({ action, limit, deploymentId, name, target }) => {
      try {
        const tokenResult = await tokens.getAccessToken("vercel");
        if (!tokenResult) return { connected: false, error: "Vercel is not connected." };
        const authHeader = { Authorization: `Bearer ${tokenResult.accessToken}` };

        if (action === "redeploy") {
          if (!deploymentId || !name) {
            return { connected: true, error: "deploymentId and name are required to redeploy." };
          }
          const res = await fetch("https://api.vercel.com/v13/deployments", {
            method: "POST",
            headers: { ...authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
              deploymentId,
              name,
              target: target ?? "production",
            }),
          });
          if (!res.ok) return { connected: true, error: `Vercel API error ${res.status}: ${await res.text()}` };
          const dep = (await res.json()) as { id?: string; url?: string };
          return {
            connected: true,
            redeployed: true,
            id: dep.id,
            url: dep.url ? `https://${dep.url}` : undefined,
          };
        }

        // list_deployments (default)
        const res = await fetch(
          `https://api.vercel.com/v6/deployments?limit=${limit ?? 10}`,
          { headers: authHeader },
        );
        if (!res.ok) return { connected: true, error: `Vercel API error ${res.status}` };
        const data = (await res.json()) as {
          deployments: Array<{
            uid?: string;
            name: string;
            url: string;
            state?: string;
            readyState?: string;
            created: number;
          }>;
        };
        return {
          connected: true,
          deployments: data.deployments.map((d) => ({
            id: d.uid,
            name: d.name,
            url: `https://${d.url}`,
            state: d.state ?? d.readyState,
            createdAt: d.created,
          })),
        };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Vercel request failed",
        };
      }
    },
  });
}

/**
 * Build the todoist tool. Available when the user has connected Todoist.
 * Creates, lists and completes tasks via the Todoist REST v2 API on the user's
 * behalf. Todoist access tokens do not expire, so no refresh logic is needed.
 */
function makeTodoistTool(tokens: ConnectorTokens) {
  // Todoist REST priority is inverted from the label: 4 = highest, 1 = normal.
  const PRIORITY_MAP: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  const BASE = "https://api.todoist.com/rest/v2";
  return tool({
    description: [
      "Read AND modify the user's connected Todoist account.",
      "",
      "Task actions:",
      "- list_tasks: list active (incomplete) tasks. Optionally scope to projectId,",
      "  or pass a Todoist filter (e.g. 'today', 'overdue', '#Work').",
      "- create_task: add a task (needs content). Set a due date with dueDatetime",
      "  (absolute ISO 8601, resolve relative phrases yourself from the CURRENT",
      "  TIME) or dueString (Todoist natural language, e.g. 'tomorrow at 3pm').",
      "  Optionally place it in a projectId.",
      "- update_task: edit an existing task (needs taskId). Change content,",
      "  description, due date (dueDatetime/dueString) or priority. To clear a due",
      "  date pass dueString = 'no date'.",
      "- complete_task: mark a task done (needs taskId).",
      "- delete_task: permanently remove a task (needs taskId). Confirm first if",
      "  the target is at all ambiguous.",
      "",
      "Project actions:",
      "- list_projects: list the user's projects (use to resolve a project name to",
      "  a projectId before creating/listing within it).",
      "",
      "You usually need an id first: call list_tasks / list_projects, then act on the",
      "id. Use this when the user asks to add/sync/manage something in Todoist, or",
      "@mentions @todoist. After acting, confirm in one sentence. If Todoist is not",
      "connected, tell the user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum([
          "list_tasks",
          "create_task",
          "update_task",
          "complete_task",
          "delete_task",
          "list_projects",
        ])
        .describe("The Todoist operation to perform."),
      content: z
        .string()
        .optional()
        .describe("For create_task/update_task: the task title/content."),
      description: z
        .string()
        .optional()
        .describe("For create_task/update_task: optional extra detail."),
      dueDatetime: z
        .string()
        .optional()
        .describe(
          "For create_task/update_task: absolute ISO 8601 due datetime (e.g. 2026-06-09T15:00:00Z). Resolve relative phrases yourself.",
        ),
      dueString: z
        .string()
        .optional()
        .describe(
          "For create_task/update_task: Todoist natural-language due date (e.g. 'tomorrow at 3pm', or 'no date' to clear). Use only if you can't form an absolute datetime.",
        ),
      priority: z
        .enum(TASK_PRIORITIES)
        .optional()
        .describe("For create_task/update_task: priority. Default 'medium'."),
      projectId: z
        .string()
        .optional()
        .describe(
          "For create_task/list_tasks: the project to scope to (from list_projects). Omit for the Inbox / all projects.",
        ),
      filter: z
        .string()
        .optional()
        .describe(
          "For list_tasks: a Todoist filter query (e.g. 'today', 'overdue', '#Work'). Optional.",
        ),
      taskId: z
        .string()
        .optional()
        .describe(
          "For update_task/complete_task/delete_task: the id of the task to act on (from list_tasks).",
        ),
    }),
    execute: async ({
      action,
      content,
      description,
      dueDatetime,
      dueString,
      priority,
      projectId,
      filter,
      taskId,
    }) => {
      try {
        const tokenResult = await tokens.getAccessToken("todoist");
        if (!tokenResult) {
          return { connected: false, error: "Todoist is not connected." };
        }
        const headers = {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        };
        const apiError = async (res: Response) => ({
          connected: true as const,
          error: `Todoist API error ${res.status}: ${await res.text()}`,
        });

        if (action === "list_projects") {
          const res = await fetch(`${BASE}/projects`, { headers });
          if (!res.ok) return apiError(res);
          const projects = (await res.json()) as Array<{
            id: string;
            name: string;
            is_inbox_project?: boolean;
            url?: string;
          }>;
          return {
            connected: true,
            projects: projects.map((p) => ({
              id: p.id,
              name: p.name,
              isInbox: p.is_inbox_project ?? false,
              url: p.url,
            })),
          };
        }

        if (action === "list_tasks") {
          const url = new URL(`${BASE}/tasks`);
          if (projectId) url.searchParams.set("project_id", projectId);
          if (filter) url.searchParams.set("filter", filter);
          const res = await fetch(url, { headers });
          if (!res.ok) return apiError(res);
          const tasks = (await res.json()) as Array<{
            id: string;
            content: string;
            priority?: number;
            project_id?: string;
            url?: string;
            due?: { datetime?: string; date?: string; string?: string };
          }>;
          return {
            connected: true,
            tasks: tasks.map((t) => ({
              id: t.id,
              content: t.content,
              due: t.due?.datetime ?? t.due?.date ?? t.due?.string,
              projectId: t.project_id,
              url: t.url,
            })),
          };
        }

        if (action === "create_task") {
          if (!content) {
            return { connected: true, error: "content is required to create a task." };
          }
          const body: Record<string, unknown> = { content };
          if (description) body.description = description;
          if (dueDatetime) body.due_datetime = dueDatetime;
          else if (dueString) body.due_string = dueString;
          if (priority) body.priority = PRIORITY_MAP[priority];
          if (projectId) body.project_id = projectId;
          const res = await fetch(`${BASE}/tasks`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          if (!res.ok) return apiError(res);
          const task = (await res.json()) as { id: string; url?: string };
          return { connected: true, created: true, id: task.id, url: task.url };
        }

        if (action === "update_task") {
          if (!taskId) {
            return { connected: true, error: "taskId is required to update a task." };
          }
          const body: Record<string, unknown> = {};
          if (content !== undefined) body.content = content;
          if (description !== undefined) body.description = description;
          if (dueDatetime) body.due_datetime = dueDatetime;
          else if (dueString) body.due_string = dueString;
          if (priority) body.priority = PRIORITY_MAP[priority];
          if (Object.keys(body).length === 0) {
            return { connected: true, error: "Nothing to update — provide a field to change." };
          }
          const res = await fetch(`${BASE}/tasks/${taskId}`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          if (!res.ok) return apiError(res);
          return { connected: true, updated: true, id: taskId };
        }

        if (action === "delete_task") {
          if (!taskId) {
            return { connected: true, error: "taskId is required to delete a task." };
          }
          const res = await fetch(`${BASE}/tasks/${taskId}`, {
            method: "DELETE",
            headers,
          });
          if (!res.ok) return apiError(res);
          return { connected: true, deleted: true, id: taskId };
        }

        // complete_task
        if (!taskId) {
          return { connected: true, error: "taskId is required to complete a task." };
        }
        const res = await fetch(`${BASE}/tasks/${taskId}/close`, {
          method: "POST",
          headers,
        });
        if (!res.ok) return apiError(res);
        return { connected: true, completed: true, id: taskId };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Todoist request failed",
        };
      }
    },
  });
}

/**
 * Validates that a string is an IANA timezone the runtime recognises.
 * Avoids passing junk like "local", "user", or "UTC+1" to the widget.
 */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Offset (in ms) of an IANA timezone at a given instant, such that
 * wallClockMs = instant + offset. Positive for zones ahead of UTC (e.g.
 * +3_600_000 for UTC+1). Used to interpret an offset-less wall-clock datetime.
 */
function tzOffsetMs(timeZone: string, instant: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instant))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - instant;
}

/**
 * Resolve the model's ISO due date to a UTC timestamp.
 *
 * The model is given the user's local wall-clock time and usually emits an
 * offset-LESS datetime (e.g. "2026-06-09T12:00:00"). `Date.parse` would
 * interpret that in the *server's* zone (UTC on Vercel), so a user in UTC+1
 * would see every reminder land an hour late. When the string carries no
 * explicit offset we instead interpret its wall-clock components in the user's
 * timezone. Strings that DO carry an offset (Z or ±hh:mm) are trusted as-is.
 */
function resolveDueDate(
  dueDateIso: string | undefined,
  userTimezone: string | null,
): number | undefined {
  if (!dueDateIso) return undefined;
  const iso = dueDateIso.trim();

  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const tz = userTimezone && isValidTimezone(userTimezone) ? userTimezone : null;
  if (hasOffset || !tz) {
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!m) {
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  const [, y, mo, d, h, mi, s] = m;
  // Components read as if they were UTC, then shifted by the zone's offset.
  const wallMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  );
  return wallMs - tzOffsetMs(tz, wallMs);
}

/**
 * Build the get_current_time tool with the user's true local timezone baked in
 * as the default. The model can still override it (e.g. "what time is it in Tokyo?")
 * — but if it doesn't, we use the client-reported zone instead of letting the
 * model guess (which usually goes badly: many models default to Asia/Kolkata or UTC).
 */
// ── Google connectors (Gmail / Calendar / Drive) ─────────────────────────────
// Google access tokens expire after ~1h. This helper returns a guaranteed-fresh
// access token: it reads the stored token set, and if the access token is
// missing/expired, exchanges the refresh token for a new one (and persists it).
async function getGoogleAccessToken(
  tokens: ConnectorTokens,
  provider: "gmail" | "google_calendar" | "google_drive",
): Promise<{ accessToken: string } | { error: string }> {
  const tokenSet = await tokens.getRefreshableToken(provider);
  if (!tokenSet) {
    return { error: `${provider} is not connected.` };
  }

  // Treat as valid if it has >60s of life left.
  const stillValid =
    tokenSet.tokenExpiresAt != null &&
    tokenSet.tokenExpiresAt - Date.now() > 60_000;
  if (stillValid && tokenSet.accessToken) {
    return { accessToken: tokenSet.accessToken };
  }

  if (!tokenSet.refreshToken) {
    // No refresh token and the access token is stale — ask the user to reconnect.
    if (tokenSet.accessToken && tokenSet.tokenExpiresAt == null) {
      return { accessToken: tokenSet.accessToken };
    }
    return {
      error: `${provider} access expired. Please reconnect it in Settings → Connectors.`,
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: "Google connector is not configured." };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenSet.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error(`[oauth ${provider}] refresh failed`, {
      status: res.status,
      body: await res.text().catch(() => "<unreadable>"),
    });
    return {
      error: `${provider} access expired. Please reconnect it in Settings → Connectors.`,
    };
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    return { error: `${provider} token refresh returned no token.` };
  }

  const tokenExpiresAt = json.expires_in
    ? Date.now() + json.expires_in * 1000
    : undefined;
  // Persist the refreshed token (best-effort — don't block the call on it).
  try {
    await tokens.persistRefreshedToken(provider, json.access_token, tokenExpiresAt);
  } catch (error) {
    console.error(`[oauth ${provider}] failed to persist refreshed token`, error);
  }

  return { accessToken: json.access_token };
}

// Turn a failed Google API response into a readable, actionable error string.
// Google returns { error: { code, message, status, errors:[{reason}] } }.
async function googleApiError(res: Response, label: string): Promise<string> {
  let message = `${label} API error ${res.status}`;
  try {
    const data = (await res.json()) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    const reason = data.error?.errors?.[0]?.reason;
    if (data.error?.message) message = `${label}: ${data.error.message}`;
    // Common, fixable causes — make the remedy explicit for the model to relay.
    if (res.status === 403 && reason === "accessNotConfigured") {
      message +=
        " (Enable this Google API in your Google Cloud project, then retry.)";
    } else if (
      res.status === 403 &&
      (reason === "insufficientPermissions" || reason === "forbidden")
    ) {
      message +=
        " (The connection is missing the required scope — disconnect and reconnect this connector in Settings → Connectors to re-grant access.)";
    }
  } catch {
    /* keep the status-only message */
  }
  return message;
}

// Assemble the connector tool set for an AUTONOMOUS agent-task run (no user
// session). Uses owner-scoped token access; excludes image/web/perplexity and
// create_task (those need extra context). Shared with the interactive path's
// factories so behavior stays identical.
export function buildAutonomousConnectorTools(
  tokens: ConnectorTokens,
  userTimezone: string | null,
): ToolSet {
  return {
    get_current_time: makeGetCurrentTimeTool(userTimezone),
    github: makeGithubTool(tokens),
    notion: makeNotionTool(tokens),
    vercel: makeVercelTool(tokens),
    gmail: makeGmailTool(tokens),
    google_calendar: makeGoogleCalendarTool(tokens),
    google_drive: makeGoogleDriveTool(tokens),
    todoist: makeTodoistTool(tokens),
  };
}

function makeGmailTool(tokens: ConnectorTokens) {
  return tool({
    description: [
      "Search and read the user's connected Gmail (read-only).",
      "",
      "Actions:",
      "- search: find messages with a Gmail search query (e.g. 'from:boss newer_than:7d', 'is:unread invoice'). Returns matching message summaries.",
      "- read: fetch the full body of one message by id (get the id from search first).",
      "",
      "Use search to find relevant mail, then summarize or answer from the results.",
      "If Gmail is not connected, tell the user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z.enum(["search", "read"]).describe("The Gmail operation."),
      query: z
        .string()
        .optional()
        .describe("For search: a Gmail search query. See Gmail search operators."),
      messageId: z
        .string()
        .optional()
        .describe("For read: the id of the message to fetch (from a prior search)."),
    }),
    execute: async ({ action, query, messageId }) => {
      try {
        const token = await getGoogleAccessToken(tokens, "gmail");
        if ("error" in token) return { connected: false, error: token.error };
        const auth = { Authorization: `Bearer ${token.accessToken}` };

        if (action === "search") {
          const url = new URL(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
          );
          url.searchParams.set("maxResults", "10");
          if (query) url.searchParams.set("q", query);
          const res = await fetch(url, { headers: auth });
          if (!res.ok)
            return { connected: true, error: await googleApiError(res, "Gmail") };
          const data = (await res.json()) as {
            messages?: Array<{ id: string }>;
          };
          const ids = (data.messages ?? []).slice(0, 10);
          // Fetch lightweight metadata for each match.
          const messages = await Promise.all(
            ids.map(async ({ id }) => {
              const m = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                { headers: auth },
              );
              if (!m.ok) return { id };
              const md = (await m.json()) as {
                snippet?: string;
                payload?: { headers?: Array<{ name: string; value: string }> };
              };
              const h = (name: string) =>
                md.payload?.headers?.find(
                  (x) => x.name.toLowerCase() === name,
                )?.value;
              return {
                id,
                from: h("from"),
                subject: h("subject"),
                date: h("date"),
                snippet: md.snippet,
              };
            }),
          );
          return { connected: true, messages };
        }

        // read
        if (!messageId)
          return { connected: true, error: "messageId is required to read." };
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: auth },
        );
        if (!res.ok)
          return { connected: true, error: await googleApiError(res, "Gmail") };
        const data = (await res.json()) as {
          snippet?: string;
          payload?: {
            headers?: Array<{ name: string; value: string }>;
            parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
            body?: { data?: string };
          };
        };
        const decode = (b64?: string) =>
          b64
            ? Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
                "utf8",
              )
            : "";
        const plain =
          data.payload?.parts?.find((p) => p.mimeType === "text/plain")?.body
            ?.data ?? data.payload?.body?.data;
        const body = decode(plain).slice(0, 8000) || data.snippet || "";
        const h = (name: string) =>
          data.payload?.headers?.find((x) => x.name.toLowerCase() === name)
            ?.value;
        return {
          connected: true,
          from: h("from"),
          subject: h("subject"),
          date: h("date"),
          body,
        };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Gmail request failed",
        };
      }
    },
  });
}

function makeGoogleCalendarTool(tokens: ConnectorTokens) {
  return tool({
    description: [
      "Read and create events on the user's connected Google Calendar.",
      "",
      "Actions:",
      "- list: list upcoming events between timeMin and timeMax (ISO 8601). Defaults to the next 7 days.",
      "- create: create an event (needs summary, start, end as ISO 8601 datetimes).",
      "",
      "Always confirm the created event back to the user (title + time).",
      "If Calendar is not connected, tell the user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z.enum(["list", "create"]).describe("The Calendar operation."),
      timeMin: z.string().optional().describe("For list: ISO start of range."),
      timeMax: z.string().optional().describe("For list: ISO end of range."),
      summary: z.string().optional().describe("For create: event title."),
      description: z.string().optional().describe("For create: event details."),
      start: z
        .string()
        .optional()
        .describe("For create: ISO 8601 start datetime (e.g. 2026-06-01T15:00:00Z)."),
      end: z
        .string()
        .optional()
        .describe("For create: ISO 8601 end datetime."),
      location: z.string().optional().describe("For create: optional location."),
    }),
    execute: async ({
      action,
      timeMin,
      timeMax,
      summary,
      description,
      start,
      end,
      location,
    }) => {
      try {
        const token = await getGoogleAccessToken(tokens, "google_calendar");
        if ("error" in token) return { connected: false, error: token.error };
        const auth = {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "list") {
          const url = new URL(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          );
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("orderBy", "startTime");
          url.searchParams.set("maxResults", "15");
          url.searchParams.set("timeMin", timeMin ?? new Date().toISOString());
          url.searchParams.set(
            "timeMax",
            timeMax ??
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          );
          const res = await fetch(url, { headers: auth });
          if (!res.ok)
            return { connected: true, error: await googleApiError(res, "Calendar") };
          const data = (await res.json()) as {
            items?: Array<{
              id: string;
              summary?: string;
              start?: { dateTime?: string; date?: string };
              end?: { dateTime?: string; date?: string };
              location?: string;
              htmlLink?: string;
            }>;
          };
          return {
            connected: true,
            events: (data.items ?? []).map((e) => ({
              id: e.id,
              summary: e.summary,
              start: e.start?.dateTime ?? e.start?.date,
              end: e.end?.dateTime ?? e.end?.date,
              location: e.location,
              link: e.htmlLink,
            })),
          };
        }

        // create
        if (!summary || !start || !end) {
          return {
            connected: true,
            error: "summary, start and end are required to create an event.",
          };
        }
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: auth,
            body: JSON.stringify({
              summary,
              description,
              location,
              start: { dateTime: start },
              end: { dateTime: end },
            }),
          },
        );
        if (!res.ok)
          return { connected: true, error: await googleApiError(res, "Calendar") };
        const ev = (await res.json()) as { id: string; htmlLink?: string };
        return { connected: true, created: true, id: ev.id, link: ev.htmlLink };
      } catch (error) {
        return {
          connected: false,
          error:
            error instanceof Error ? error.message : "Calendar request failed",
        };
      }
    },
  });
}

function makeGoogleDriveTool(tokens: ConnectorTokens) {
  return tool({
    description: [
      "Search and read files from the user's connected Google Drive (read-only).",
      "",
      "Actions:",
      "- search: find files by name/content (query optional; empty returns recent files).",
      "- read: fetch the text content of a file by id (Google Docs are exported as text).",
      "",
      "Use search to find a file, then read it to answer questions about its contents.",
      "If Drive is not connected, tell the user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z.enum(["search", "read"]).describe("The Drive operation."),
      query: z
        .string()
        .optional()
        .describe("For search: text to match in file names/content."),
      fileId: z
        .string()
        .optional()
        .describe("For read: the id of the file to read (from a prior search)."),
    }),
    execute: async ({ action, query, fileId }) => {
      try {
        const token = await getGoogleAccessToken(tokens, "google_drive");
        if ("error" in token) return { connected: false, error: token.error };
        const auth = { Authorization: `Bearer ${token.accessToken}` };

        if (action === "search") {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("pageSize", "10");
          url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");
          if (query) {
            const escaped = query.replace(/'/g, "\\'");
            url.searchParams.set(
              "q",
              `name contains '${escaped}' or fullText contains '${escaped}'`,
            );
          }
          const res = await fetch(url, { headers: auth });
          if (!res.ok)
            return { connected: true, error: await googleApiError(res, "Drive") };
          const data = (await res.json()) as {
            files?: Array<{
              id: string;
              name: string;
              mimeType: string;
              modifiedTime?: string;
              webViewLink?: string;
            }>;
          };
          return { connected: true, files: data.files ?? [] };
        }

        // read
        if (!fileId)
          return { connected: true, error: "fileId is required to read." };
        // Look up mime type to decide export vs download.
        const meta = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
          { headers: auth },
        );
        if (!meta.ok)
          return { connected: true, error: await googleApiError(meta, "Drive") };
        const { name, mimeType } = (await meta.json()) as {
          name: string;
          mimeType: string;
        };
        const isGoogleDoc = mimeType.startsWith("application/vnd.google-apps");
        const contentUrl = isGoogleDoc
          ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
          : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const res = await fetch(contentUrl, { headers: auth });
        if (!res.ok)
          return {
            connected: true,
            error: await googleApiError(res, "Drive"),
          };
        const text = (await res.text()).slice(0, 10000);
        return { connected: true, name, mimeType, content: text };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Drive request failed",
        };
      }
    },
  });
}

function makeGetCurrentTimeTool(userTimezone: string | null) {
  const fallbackZone =
    userTimezone && isValidTimezone(userTimezone) ? userTimezone : null;

  return tool({
    description: [
      "Get the current real-world time and render a clock widget.",
      "",
      "Call this ONLY when the user is explicitly asking what the current time/date is (e.g. 'what time is it', 'what's today's date', 'is it morning in Tokyo').",
      "",
      "DO NOT call this when the user is scheduling something at a time (e.g. 'remind me at 3pm', 'set a task for tomorrow 9am', 'do X at 5'). In those cases the user is GIVING you a time, not asking for it — use create_task and resolve the datetime from the CURRENT TIME provided in your context. Calling this here wrongly shows the user a clock they didn't ask for.",
      "",
      "TIMEZONE PARAMETER:",
      "- Only set `timezone` if the user explicitly names a different location (e.g. 'what time is it in Tokyo' → 'Asia/Tokyo').",
      "- For 'what time is it', 'what's today's date', 'is it morning' etc., DO NOT set timezone. The server already knows the user's local zone and will use it automatically.",
      "- Never invent a timezone. Never pass 'local', 'user', or 'UTC' as a default.",
      "",
      "RESPONSE STYLE: The clock widget displays the time visually. Don't restate the digits. A short line like 'Here you go:' is fine.",
    ].join("\n"),
    inputSchema: z.object({
      timezone: z
        .string()
        .optional()
        .describe(
          'IANA timezone (e.g. "Asia/Tokyo"). Only set this when the user explicitly asks about a non-local zone. Omit otherwise — the server uses the user\'s real local timezone automatically.',
        ),
    }),
    execute: async ({ timezone }) => {
      // Priority: explicit valid model arg → known user zone → null (widget falls back to client local)
      let resolved: string | null = null;
      if (timezone && isValidTimezone(timezone)) {
        resolved = timezone;
      } else if (fallbackZone) {
        resolved = fallbackZone;
      }
      return {
        iso: new Date().toISOString(),
        timezone: resolved,
      };
    },
  });
}
import {
  buildMemoryContext,
  buildResponseBudgetContext,
  buildImageGenerationContext,
  buildWebSearchContext,
  buildWebSearchResultsContext,
  CHAT_SYSTEM_PROMPT,
  isLikelyImageRequest,
  isLikelyWebSearchRequest,
  looksLikeSportsPlayerQuery,
} from "./prompt";

export type ToolsConfigResult = {
  tools: ToolSet;
  hasImageGen: boolean;
  hasWebSearch: boolean;
  supportsTools: boolean;
  provider: string;
  shouldAttachWebSearchTool: boolean;
  canUseOpenAIImageTool: boolean;
  openaiImageToolSize: OpenAIImageSize | null;
  systemPrompt: string;
  forceImageTool: boolean;
  forceWebSearchTool: boolean;
};

export function buildToolsAndPrompt(options: {
  requestedModel: AiGatewayModel;
  modelId: string;
  webSearchEnabled: boolean;
  lastUserContent: string;
  maxOutputTokens: number;
  imageAspectRatio?: string | null;
  imageSize?: string | null;
  apiKey: string;
  gatewayOpenAIBaseUrl: string;
  userTimezone?: string | null;
  memoryContextText?: string | null;
  webSearchContextText?: string | null;
  convexToken?: string | null;
  chatId?: Id<"chats"> | null;
  agentId?: AgentId | null;
}): ToolsConfigResult {
  const {
    requestedModel,
    modelId,
    webSearchEnabled,
    lastUserContent,
    maxOutputTokens,
    imageAspectRatio,
    imageSize,
    apiKey,
    gatewayOpenAIBaseUrl,
    userTimezone,
    memoryContextText,
    webSearchContextText,
    convexToken,
    chatId,
    agentId,
  } = options;

  const capabilities = deriveCapabilities(requestedModel);
  const hasImageGen = capabilities.includes("image-generation");
  const hasWebSearch = capabilities.includes("web-search");
  const supportsTools = modelSupportsTools(requestedModel);
  const provider = modelId.split("/")[0] ?? "";

  const tools: ToolSet = {};
  const shouldAttachWebSearchTool = webSearchEnabled && supportsTools;
  const sportsPlayerQuery = looksLikeSportsPlayerQuery(lastUserContent);

  // Always-available lightweight time tool for any model that supports tools.
  // The user's actual local zone is captured in the closure so the model never
  // has to guess (and we override it to "local" when it picks something silly
  // like UTC or Asia/Kolkata).
  if (supportsTools) {
    tools.get_current_time = makeGetCurrentTimeTool(userTimezone ?? null);
  }

  // Task creation is available whenever the model supports tools and we have an
  // authed Convex token to write on the user's behalf.
  if (supportsTools && convexToken) {
    const tokens = userConnectorTokens(convexToken);
    tools.create_task = makeCreateTaskTool(
      convexToken,
      chatId ?? null,
      userTimezone ?? null,
    );
    tools.github = makeGithubTool(tokens);
    tools.notion = makeNotionTool(tokens);
    tools.vercel = makeVercelTool(tokens);
    tools.gmail = makeGmailTool(tokens);
    tools.google_calendar = makeGoogleCalendarTool(tokens);
    tools.google_drive = makeGoogleDriveTool(tokens);
    tools.todoist = makeTodoistTool(tokens);
  }

  if (webSearchEnabled && !hasWebSearch) {
    console.warn(
      `[chat-debug] model metadata does not report web-search capability for ${modelId}; attaching perplexity_search tool optimistically`,
    );
  }

  if (shouldAttachWebSearchTool) {
    tools.perplexity_search = gateway.tools.perplexitySearch({
      searchRecencyFilter: sportsPlayerQuery ? "year" : "month",
      maxResults: 5,
      maxTokensPerPage: 512,
      maxTokens: 4000,
      ...(sportsPlayerQuery
        ? {
            searchDomainFilter: [
              "espn.com",
              "fbref.com",
              "whoscored.com",
              "sofascore.com",
              "premierleague.com",
              "chelseafc.com",
            ],
          }
        : {}),
    });
  }

  const canUseOpenAIImageTool = hasImageGen && provider === "openai";
  let openaiImageToolSize: OpenAIImageSize | null = null;
  if (canUseOpenAIImageTool) {
    const size = toOpenAIImageSize(imageAspectRatio, imageSize);
    openaiImageToolSize = size;
    const openaiViaGateway = createOpenAI({
      apiKey,
      baseURL: gatewayOpenAIBaseUrl,
    });
    tools.image_generation = openaiViaGateway.tools.imageGeneration({
      outputFormat: "webp",
      quality: "high",
      size: size === "auto" ? "auto" : size,
    });
  }

  const webSearchContext = buildWebSearchContext({
    webSearchEnabled,
    shouldAttachWebSearchTool,
  });
  const responseBudgetContext = buildResponseBudgetContext({ maxOutputTokens });
  const imageGenContext = buildImageGenerationContext({
    canUseOpenAIImageTool,
    hasImageGen,
    modelId,
    imageAspectRatio,
    imageSize,
  });
  const taskToolContext = tools.create_task
    ? "\n\nTASKS: You can create tasks/reminders with the create_task tool. When the user clearly states something to do or be reminded of, create it and confirm briefly. When they include a time (e.g. 'remind me at 3pm'), that is the DUE time for the task — resolve it from the CURRENT TIME in your context and set dueDateIso; do NOT call get_current_time and do NOT show a clock widget (they did not ask what time it is). If the intent or timing is unclear, ask one short clarifying question before creating."
    : "";
  const connectorToolContext = tools.github
    ? "\n\nCONNECTORS: You can both READ and ACT on the user's connected accounts via tools — github (list ALL repos with accurate count, read repos/files/commits/branches, search code, create/update/close/reopen/comment issues, commit files, create branches and pull requests), notion (search, create pages, append content), vercel (list deployments, redeploy), gmail (search and read email), google_calendar (list and create events), google_drive (search and read files), and todoist (list, create and complete tasks). These tools are NOT read-only where actions exist: when the user asks you to create an event, create a page, comment, close, redeploy, or add a Todoist task, call the tool to actually do it. For destructive or write actions, briefly confirm the target if it's ambiguous, then perform it. The user may reference a connector with an @mention (e.g. '@github', '@notion', '@gmail', '@google_calendar', '@google_drive', '@todoist') or naturally ('my calendar', 'my email', 'my drive', 'my todoist'); when they do, call that tool. Never claim you cannot access their accounts — you have these tools. If a tool reports the connector is not connected, tell the user to connect it in Settings → Connectors. CRITICAL: After ANY tool call you MUST write a clear natural-language reply summarizing what you did or found (e.g. 'Created “Lunch” for tomorrow 1pm' or 'You have 3 unread emails: …'). Never end your turn with only a tool call and no text."
    : "";

  // When the user explicitly @-mentions a connected connector, force the model to
  // actually call that tool rather than guessing or claiming it's unavailable.
  const mentionedProviders = tools.github
    ? Array.from(
        new Set(
          (
            lastUserContent.match(
              /@(github|notion|vercel|gmail|google_calendar|google_drive|todoist)\b/gi,
            ) ?? []
          ).map((s) => s.slice(1).toLowerCase()),
        ),
      )
    : [];
  const mentionDirective = mentionedProviders.length
    ? `\n\nIMPORTANT — CONNECTOR MENTION: The user attached these connectors to their message: ${mentionedProviders.join(", ")}. You MUST call the matching tool (${mentionedProviders.join(", ")}) to fulfill this request, then reply with a natural-language summary of the result. Treat the @mention as an explicit instruction to use that tool. Never claim the connector is disabled or unavailable unless the tool result itself reports it is not connected.`
    : "";

  // Active agent persona: prepend its directive so the model adopts the agent's
  // expertise/tone. Agents share the same memory/tools — only the prompt differs.
  const agent = getAgent(agentId ?? null);
  const agentContext = agent
    ? `\n\nACTIVE AGENT — ${agent.name}: ${agent.systemPrompt}`
    : "";

  // Give the model the real "now" in the user's timezone so it can resolve
  // relative scheduling phrases ("tomorrow 3pm", "in 2 hours") on its own —
  // without calling the get_current_time clock widget just to set a reminder.
  const nowContext = (() => {
    const tz =
      userTimezone && isValidTimezone(userTimezone) ? userTimezone : undefined;
    try {
      const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date());
      return `\n\nCURRENT TIME: It is currently ${formatted}${tz ? ` (${tz})` : ""}. Use this to resolve relative dates/times yourself. Do NOT call get_current_time just to schedule a task or reminder — only call it when the user is actually asking what the time or date is.`;
    } catch {
      return "";
    }
  })();

  const systemPrompt =
    CHAT_SYSTEM_PROMPT +
    agentContext +
    nowContext +
    responseBudgetContext +
    webSearchContext +
    imageGenContext +
    taskToolContext +
    connectorToolContext +
    mentionDirective +
    buildMemoryContext(memoryContextText ?? null) +
    buildWebSearchResultsContext(webSearchContextText ?? null);

  const forceImageTool =
    hasImageGen &&
    provider === "openai" &&
    !!tools.image_generation &&
    isLikelyImageRequest(lastUserContent);
  const forceWebSearchTool =
    shouldAttachWebSearchTool &&
    !!tools.perplexity_search &&
    isLikelyWebSearchRequest(lastUserContent);

  return {
    tools,
    hasImageGen,
    hasWebSearch,
    supportsTools,
    provider,
    shouldAttachWebSearchTool,
    canUseOpenAIImageTool,
    openaiImageToolSize,
    systemPrompt,
    forceImageTool,
    forceWebSearchTool,
  };
}
