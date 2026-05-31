import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { K_AI_PRIMARY_MODEL, K_AI_MODEL_CHAIN } from "../lib/kai";

// ── Internal reads ────────────────────────────────────────────────────────────
export const getTaskForRun = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const user = await ctx.db.get(task.ownerId);
    if (!user) return null;
    return { task, plan: user.plan ?? null };
  },
});

// Lightweight context: the owner's open tasks and active projects. Enough for
// "summarize my day", "draft a standup", etc. (No connectors/web in v1.)
export const getOwnerContext = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .take(100);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .take(20);
    return {
      openTasks: tasks
        .filter((t) => t.status !== "done")
        .slice(0, 30)
        .map((t) => ({
          title: t.title,
          due: t.dueDate ?? null,
          priority: t.priority,
        })),
      projects: projects
        .filter((p) => !p.archived)
        .map((p) => ({ name: p.name, status: p.status })),
    };
  },
});

// Persist the AI result as a chat the user can open and continue.
export const recordResult = internalMutation({
  args: {
    ownerId: v.id("users"),
    title: v.string(),
    instruction: v.string(),
    result: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"chats">> => {
    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      ownerId: args.ownerId,
      title: args.title.slice(0, 80),
      archived: false,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      source: { provider: "unknown", importedAt: now, importMethod: "manual" },
    });
    const messages = [
      { role: "user" as const, content: args.instruction },
      { role: "assistant" as const, content: args.result },
    ];
    await Promise.all(
      messages.map((m, index) =>
        ctx.db.insert("messages", {
          chatId,
          ownerId: args.ownerId,
          role: m.role,
          content: m.content,
          tokenCount: Math.ceil(m.content.length / 4),
          createdAt: now,
          order: index,
          metadata: { tokenCount: Math.ceil(m.content.length / 4) },
        }),
      ),
    );
    return chatId;
  },
});

function buildContextBlock(context: {
  openTasks: Array<{ title: string; due: number | null; priority: string }>;
  projects: Array<{ name: string; status: string }>;
}): string {
  const parts: string[] = [];
  if (context.projects.length) {
    parts.push(
      "Active projects:\n" +
        context.projects.map((p) => `- ${p.name} (${p.status})`).join("\n"),
    );
  }
  if (context.openTasks.length) {
    parts.push(
      "Open tasks:\n" +
        context.openTasks
          .map(
            (t) =>
              `- ${t.title}${t.due ? ` (due ${new Date(t.due).toISOString().slice(0, 16).replace("T", " ")})` : ""} [${t.priority}]`,
          )
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

// ── The autonomous run ────────────────────────────────────────────────────────
export const run = internalAction({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args): Promise<null> => {
    const data = await ctx.runQuery(internal.agentTasks.getTaskForRun, {
      taskId: args.taskId,
    });
    if (!data || !data.task.aiInstruction) return null;
    const { task } = data;
    const instruction = task.aiInstruction!;

    const apiKey = process.env.OPEN_ROUTER;
    if (!apiKey) {
      console.error("[agent-task] OPEN_ROUTER not set on Convex deployment");
      await ctx.runMutation(internal.notifications.create, {
        ownerId: task.ownerId,
        type: "system",
        title: `Couldn't run: ${task.title}`,
        body: "K-AI is not configured for scheduled tasks. Please contact support.",
        taskId: task._id,
      });
      return null;
    }

    let result = "";
    const appUrl = process.env.APP_URL;
    const agentSecret = process.env.AGENT_TASK_SECRET;

    // Preferred path: the Next endpoint runs the full tool pipeline (connectors
    // + web search) with owner-scoped token access. Falls back to a context-only
    // OpenRouter call if that endpoint isn't configured.
    try {
      if (appUrl && agentSecret) {
        const res = await fetch(`${appUrl}/api/agent-task/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-agent-secret": agentSecret,
          },
          body: JSON.stringify({
            ownerId: task.ownerId,
            instruction,
            agentId: task.agentId ?? null,
          }),
        });
        if (!res.ok) {
          throw new Error(`agent-task endpoint ${res.status}: ${await res.text().catch(() => "")}`);
        }
        const json = (await res.json()) as { text?: string };
        result = (json.text ?? "").trim();
      } else {
        // Fallback: context-only generation (no connectors/web).
        const context = await ctx.runQuery(internal.agentTasks.getOwnerContext, {
          ownerId: task.ownerId,
        });
        const contextBlock = buildContextBlock(context);
        const system = [
          "You are K-AI 1.0, Kontinue AI's intelligence layer, running a SCHEDULED autonomous task for the user (they are not present).",
          "Carry out the user's instruction and produce a clear, self-contained result they can read later.",
          "Be concise and well-structured. If you lack live data access for part of the request, do what you can and clearly note what couldn't be done.",
          contextBlock ? `\nUser context:\n${contextBlock}` : "",
        ].join("\n");
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: K_AI_PRIMARY_MODEL,
            models: K_AI_MODEL_CHAIN,
            messages: [
              { role: "system", content: system },
              { role: "user", content: instruction },
            ],
            max_tokens: 1200,
          }),
        });
        if (!res.ok) {
          throw new Error(`OpenRouter ${res.status}: ${await res.text().catch(() => "")}`);
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        result = json.choices?.[0]?.message?.content?.trim() ?? "";
      }
    } catch (error) {
      console.error("[agent-task] model call failed", error);
      await ctx.runMutation(internal.notifications.create, {
        ownerId: task.ownerId,
        type: "system",
        title: `Couldn't complete: ${task.title}`,
        body: "K-AI hit an error running this scheduled task. It will try again on the next run if recurring.",
        taskId: task._id,
      });
      return null;
    }

    if (!result) result = "K-AI completed the task but returned no content.";

    // Save as a chat the user can open and continue.
    const chatId = await ctx.runMutation(internal.agentTasks.recordResult, {
      ownerId: task.ownerId,
      title: task.title,
      instruction,
      result,
    });

    const title = `K-AI completed: ${task.title}`;
    const snippet = result.slice(0, 280);
    // In-app notification (links to the chat).
    await ctx.runMutation(internal.notifications.create, {
      ownerId: task.ownerId,
      type: "system",
      title,
      body: snippet,
      taskId: task._id,
      chatId,
    });
    // Email + web push.
    await ctx.scheduler.runAfter(0, internal.reminderDelivery.deliver, {
      userId: task.ownerId,
      title,
      body: snippet,
      taskId: task._id,
    });

    return null;
  },
});
