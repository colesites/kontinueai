import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { fetchMutation, fetchAction } from "convex/nextjs";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { deriveCapabilities } from "@repo/ai/lib/model-capabilities";
import { getAgent, type AgentId } from "@repo/ai/lib/agents";
import type { AiGatewayModel, OpenAIImageSize } from "./types";
import { modelSupportsTools } from "./model-utils";
import { toOpenAIImageSize } from "./request-utils";

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
      "absolute ISO 8601 datetime using the current time (call get_current_time if",
      "unsure of 'now'). Omit dueDateIso when the user gives no timing.",
      "",
      "After creating, briefly confirm to the user in one sentence.",
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
      let dueDate: number | undefined;
      if (dueDateIso) {
        const parsed = Date.parse(dueDateIso);
        if (!Number.isNaN(parsed)) dueDate = parsed;
      }
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
function makeGithubTool(convexToken: string) {
  return tool({
    description: [
      "Read AND modify the user's connected GitHub account.",
      "",
      "Read actions: list_repos, list_issues.",
      "Write actions: create_issue, comment_issue, close_issue.",
      "",
      "Examples:",
      "- 'What are my latest repos?' → list_repos",
      "- 'List open issues on my-org/my-repo' → list_issues",
      "- 'Open an issue on owner/repo titled X' → create_issue",
      "- 'Comment \"done\" on issue 12 in owner/repo' → comment_issue",
      "- 'Close issue 12 in owner/repo' → close_issue",
      "",
      "For write actions, confirm the target repo/issue with the user if it is",
      "ambiguous. Only works if GitHub is connected in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum([
          "list_repos",
          "list_issues",
          "create_issue",
          "comment_issue",
          "close_issue",
        ])
        .describe("The GitHub operation to perform."),
      repo: z
        .string()
        .optional()
        .describe("Repository as 'owner/name' (e.g. 'vercel/next.js'). Required for all actions except list_repos."),
      title: z
        .string()
        .optional()
        .describe("For create_issue: the issue title."),
      body: z
        .string()
        .optional()
        .describe("For create_issue: issue body. For comment_issue: the comment text."),
      issueNumber: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("For comment_issue / close_issue: the issue number."),
    }),
    execute: async ({ action, repo, title, body, issueNumber }) => {
      try {
        const tokenResult = await fetchAction(
          convexApi.connectors.getAccessToken,
          { provider: "github" },
          { token: convexToken },
        );
        if (!tokenResult) {
          return { connected: false, error: "GitHub is not connected." };
        }
        const headers = {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "KontinueAI",
        };

        if (action === "list_repos") {
          const res = await fetch(
            "https://api.github.com/user/repos?sort=updated&per_page=10",
            { headers },
          );
          if (!res.ok) {
            return { connected: true, error: `GitHub API error ${res.status}` };
          }
          const repos = (await res.json()) as Array<{
            full_name: string;
            description: string | null;
            private: boolean;
            html_url: string;
            updated_at: string;
          }>;
          return {
            connected: true,
            repos: repos.map((r) => ({
              fullName: r.full_name,
              description: r.description,
              private: r.private,
              url: r.html_url,
              updatedAt: r.updated_at,
            })),
          };
        }

        if (!repo || !repo.includes("/")) {
          return {
            connected: true,
            error: "Provide repo as 'owner/name' for this action.",
          };
        }

        if (action === "list_issues") {
          const res = await fetch(
            `https://api.github.com/repos/${repo}/issues?state=open&per_page=10`,
            { headers },
          );
          if (!res.ok) {
            return { connected: true, error: `GitHub API error ${res.status}` };
          }
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
            issues: issues
              .filter((i) => !i.pull_request)
              .map((i) => ({
                number: i.number,
                title: i.title,
                url: i.html_url,
                state: i.state,
              })),
          };
        }

        if (action === "create_issue") {
          if (!title) {
            return { connected: true, error: "A title is required to create an issue." };
          }
          const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title, body: body ?? "" }),
          });
          if (!res.ok) {
            return { connected: true, error: `GitHub API error ${res.status}: ${await res.text()}` };
          }
          const issue = (await res.json()) as { number: number; html_url: string };
          return { connected: true, created: true, number: issue.number, url: issue.html_url };
        }

        if (action === "comment_issue") {
          if (!issueNumber || !body) {
            return { connected: true, error: "issueNumber and body are required to comment." };
          }
          const res = await fetch(
            `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`,
            { method: "POST", headers, body: JSON.stringify({ body }) },
          );
          if (!res.ok) {
            return { connected: true, error: `GitHub API error ${res.status}: ${await res.text()}` };
          }
          const comment = (await res.json()) as { html_url: string };
          return { connected: true, commented: true, url: comment.html_url };
        }

        // close_issue
        if (!issueNumber) {
          return { connected: true, error: "issueNumber is required to close an issue." };
        }
        const res = await fetch(
          `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
          { method: "PATCH", headers, body: JSON.stringify({ state: "closed" }) },
        );
        if (!res.ok) {
          return { connected: true, error: `GitHub API error ${res.status}: ${await res.text()}` };
        }
        return { connected: true, closed: true, number: issueNumber };
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
function makeNotionTool(convexToken: string) {
  return tool({
    description: [
      "Read AND write the user's connected Notion workspace.",
      "",
      "Actions:",
      "- search: find pages by title (empty query returns recent pages).",
      "- create_page: create a new page under a parent page (needs parentPageId).",
      "- append: add paragraph text to the end of an existing page (needs pageId).",
      "",
      "To create or append you usually need an id first — call search to find the",
      "parent page, then create_page with its id. Paragraphs come from the `content`",
      "field (split on newlines into blocks). If Notion is not connected, tell the",
      "user to connect it in Settings → Connectors.",
    ].join("\n"),
    inputSchema: z.object({
      action: z
        .enum(["search", "create_page", "append"])
        .describe("The Notion operation to perform."),
      query: z
        .string()
        .optional()
        .describe("For search: text to match page titles. Empty returns recent pages."),
      parentPageId: z
        .string()
        .optional()
        .describe("For create_page: the id of the parent page to nest the new page under."),
      pageId: z
        .string()
        .optional()
        .describe("For append: the id of the page to add content to."),
      title: z
        .string()
        .optional()
        .describe("For create_page: the new page's title."),
      content: z
        .string()
        .optional()
        .describe("For create_page/append: body text. Newlines become separate paragraphs."),
    }),
    execute: async ({ action, query, parentPageId, pageId, title, content }) => {
      try {
        const tokenResult = await fetchAction(
          convexApi.connectors.getAccessToken,
          { provider: "notion" },
          { token: convexToken },
        );
        if (!tokenResult) return { connected: false, error: "Notion is not connected." };
        const headers = {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        };

        if (action === "search") {
          const res = await fetch("https://api.notion.com/v1/search", {
            method: "POST",
            headers,
            body: JSON.stringify({
              query: query ?? "",
              page_size: 10,
              filter: { property: "object", value: "page" },
            }),
          });
          if (!res.ok) return { connected: true, error: `Notion API error ${res.status}` };
          const data = (await res.json()) as {
            results: Array<{ id: string; url?: string; properties?: Record<string, unknown> }>;
          };
          return {
            connected: true,
            pages: data.results.map((p) => ({
              id: p.id,
              url: p.url,
              title: extractNotionTitle(p.properties),
            })),
          };
        }

        const toParagraphs = (text: string) =>
          text.split("\n").map((line) => ({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: line ? [{ type: "text", text: { content: line } }] : [],
            },
          }));

        if (action === "create_page") {
          if (!parentPageId || !title) {
            return { connected: true, error: "parentPageId and title are required to create a page." };
          }
          const res = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers,
            body: JSON.stringify({
              parent: { page_id: parentPageId },
              properties: {
                title: { title: [{ type: "text", text: { content: title } }] },
              },
              children: content ? toParagraphs(content) : [],
            }),
          });
          if (!res.ok) return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
          const page = (await res.json()) as { id: string; url?: string };
          return { connected: true, created: true, id: page.id, url: page.url };
        }

        // append
        if (!pageId || !content) {
          return { connected: true, error: "pageId and content are required to append." };
        }
        const res = await fetch(
          `https://api.notion.com/v1/blocks/${pageId}/children`,
          { method: "PATCH", headers, body: JSON.stringify({ children: toParagraphs(content) }) },
        );
        if (!res.ok) return { connected: true, error: `Notion API error ${res.status}: ${await res.text()}` };
        return { connected: true, appended: true, pageId };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : "Notion request failed",
        };
      }
    },
  });
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

/**
 * Build the vercel tool. Lists the user's recent deployments.
 */
function makeVercelTool(convexToken: string) {
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
        const tokenResult = await fetchAction(
          convexApi.connectors.getAccessToken,
          { provider: "vercel" },
          { token: convexToken },
        );
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
  convexToken: string,
  provider: "gmail" | "google_calendar" | "google_drive",
): Promise<{ accessToken: string } | { error: string }> {
  const tokenSet = await fetchAction(
    convexApi.connectors.getRefreshableToken,
    { provider },
    { token: convexToken },
  );
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
    await fetchAction(
      convexApi.connectors.persistRefreshedToken,
      { provider, accessToken: json.access_token, tokenExpiresAt },
      { token: convexToken },
    );
  } catch (error) {
    console.error(`[oauth ${provider}] failed to persist refreshed token`, error);
  }

  return { accessToken: json.access_token };
}

function makeGmailTool(convexToken: string) {
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
        const token = await getGoogleAccessToken(convexToken, "gmail");
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
            return { connected: true, error: `Gmail API error ${res.status}` };
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
          return { connected: true, error: `Gmail API error ${res.status}` };
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

function makeGoogleCalendarTool(convexToken: string) {
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
        const token = await getGoogleAccessToken(convexToken, "google_calendar");
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
            return { connected: true, error: `Calendar API error ${res.status}` };
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
          return {
            connected: true,
            error: `Calendar API error ${res.status}: ${await res.text()}`,
          };
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

function makeGoogleDriveTool(convexToken: string) {
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
        const token = await getGoogleAccessToken(convexToken, "google_drive");
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
            return { connected: true, error: `Drive API error ${res.status}` };
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
          return { connected: true, error: `Drive API error ${meta.status}` };
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
            error: `Drive could not read this file (${res.status}).`,
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
      "Call this whenever the user asks about the current time, date, hour, day of week, or anything tied to 'now'.",
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
    tools.create_task = makeCreateTaskTool(convexToken, chatId ?? null);
    tools.github = makeGithubTool(convexToken);
    tools.notion = makeNotionTool(convexToken);
    tools.vercel = makeVercelTool(convexToken);
    tools.gmail = makeGmailTool(convexToken);
    tools.google_calendar = makeGoogleCalendarTool(convexToken);
    tools.google_drive = makeGoogleDriveTool(convexToken);
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
    ? "\n\nTASKS: You can create tasks/reminders with the create_task tool. When the user clearly states something to do or be reminded of, create it and confirm briefly. If the intent or timing is unclear, ask one short clarifying question before creating."
    : "";
  const connectorToolContext = tools.github
    ? "\n\nCONNECTORS: You can both READ and ACT on the user's connected accounts via tools — github (list repos/issues, create/comment/close issues), notion (search, create pages, append content), vercel (list deployments, redeploy), gmail (search and read email), google_calendar (list and create events), and google_drive (search and read files). These tools are NOT read-only where actions exist: when the user asks you to create an event, create a page, comment, close, or redeploy, call the tool to actually do it. For destructive or write actions, briefly confirm the target if it's ambiguous, then perform it. The user may reference a connector with an @mention (e.g. '@github', '@notion', '@gmail', '@google_calendar', '@google_drive') or naturally ('my calendar', 'my email', 'my drive'); when they do, call that tool. Never claim you cannot access their accounts — you have these tools. If a tool reports the connector is not connected, tell the user to connect it in Settings → Connectors. CRITICAL: After ANY tool call you MUST write a clear natural-language reply summarizing what you did or found (e.g. 'Created “Lunch” for tomorrow 1pm' or 'You have 3 unread emails: …'). Never end your turn with only a tool call and no text."
    : "";

  // When the user explicitly @-mentions a connected connector, force the model to
  // actually call that tool rather than guessing or claiming it's unavailable.
  const mentionedProviders = tools.github
    ? Array.from(
        new Set(
          (
            lastUserContent.match(
              /@(github|notion|vercel|gmail|google_calendar|google_drive)\b/gi,
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

  const systemPrompt =
    CHAT_SYSTEM_PROMPT +
    agentContext +
    responseBudgetContext +
    webSearchContext +
    imageGenContext +
    taskToolContext +
    connectorToolContext +
    mentionDirective +
    buildMemoryContext(memoryContextText ?? null);

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
