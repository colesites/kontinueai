import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const TASK_PRIORITY = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);
const TASK_STATUS = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// Read-only lookup that tolerates being signed out (sign-out briefly drops the
// auth token while subscribed queries are still mounted). Return null instead of
// throwing so list/read queries degrade to empty rather than crashing the app.
async function getUserOrNull(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

async function requireOwnedTask(
  ctx: QueryCtx | MutationCtx,
  taskId: Id<"tasks">,
  userId: Id<"users">,
): Promise<Doc<"tasks">> {
  const task = await ctx.db.get(taskId);
  if (!task || task.ownerId !== userId) {
    throw new ConvexError({ code: "TASK_NOT_FOUND", message: "Task not found." });
  }
  return task;
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "INVALID_TITLE",
      message: "Task title cannot be empty.",
    });
  }
  return trimmed.slice(0, TITLE_MAX);
}

// Validate a chat/project belongs to the user before linking it to a task.
async function assertOwnedChat(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
) {
  const chat = await ctx.db.get(chatId);
  if (!chat || chat.ownerId !== userId) {
    throw new ConvexError({ code: "CHAT_NOT_FOUND", message: "Chat not found." });
  }
}
async function assertOwnedProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.ownerId !== userId) {
    throw new ConvexError({
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  }
}

export const listTasks = query({
  args: {
    status: v.optional(TASK_STATUS),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getUserOrNull(ctx);
    if (!user) return [];

    let tasks: Doc<"tasks">[];
    if (args.status) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", user._id).eq("status", args.status!),
        )
        .take(500);
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .take(500);
    }

    const filtered = args.projectId
      ? tasks.filter((t) => t.projectId === args.projectId)
      : tasks;

    // Incomplete tasks first, ordered by soonest due date; completed last.
    return filtered.sort((a, b) => {
      if ((a.status === "done") !== (b.status === "done")) {
        return a.status === "done" ? 1 : -1;
      }
      const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return b.createdAt - a.createdAt;
    });
  },
});

export const getTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getUserOrNull(ctx);
    if (!user) return null;
    return await requireOwnedTask(ctx, args.taskId, user._id);
  },
});

export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    priority: v.optional(TASK_PRIORITY),
    status: v.optional(TASK_STATUS),
    projectId: v.optional(v.id("projects")),
    recurring: v.optional(v.boolean()),
    recurrenceRule: v.optional(v.string()),
    isAgentTask: v.optional(v.boolean()),
    aiInstruction: v.optional(v.string()),
    agentId: v.optional(v.string()),
    linkedConversationId: v.optional(v.id("chats")),
    reminderMinutesBefore: v.optional(v.number()),
    createdByAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.projectId) await assertOwnedProject(ctx, args.projectId, user._id);
    if (args.linkedConversationId)
      await assertOwnedChat(ctx, args.linkedConversationId, user._id);

    const now = Date.now();
    return await ctx.db.insert("tasks", {
      ownerId: user._id,
      projectId: args.projectId,
      title: normalizeTitle(args.title),
      description: args.description?.trim().slice(0, DESCRIPTION_MAX) || undefined,
      dueDate: args.dueDate,
      priority: args.priority ?? "medium",
      status: args.status ?? "todo",
      recurring: args.recurring ?? false,
      recurrenceRule: args.recurrenceRule,
      isAgentTask: args.isAgentTask ?? false,
      aiInstruction: args.aiInstruction?.trim().slice(0, 2000) || undefined,
      agentId: args.agentId,
      linkedConversationId: args.linkedConversationId,
      reminderMinutesBefore: args.reminderMinutesBefore,
      createdByAgent: args.createdByAgent,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.union(v.number(), v.null())),
    priority: v.optional(TASK_PRIORITY),
    status: v.optional(TASK_STATUS),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    recurring: v.optional(v.boolean()),
    recurrenceRule: v.optional(v.union(v.string(), v.null())),
    isAgentTask: v.optional(v.boolean()),
    aiInstruction: v.optional(v.union(v.string(), v.null())),
    agentId: v.optional(v.union(v.string(), v.null())),
    reminderMinutesBefore: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const task = await requireOwnedTask(ctx, args.taskId, user._id);

    const patch: Partial<Doc<"tasks">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = normalizeTitle(args.title);
    if (args.isAgentTask !== undefined) patch.isAgentTask = args.isAgentTask;
    if (args.aiInstruction !== undefined)
      patch.aiInstruction = args.aiInstruction?.trim().slice(0, 2000) || undefined;
    if (args.agentId !== undefined) patch.agentId = args.agentId ?? undefined;
    if (args.description !== undefined)
      patch.description =
        args.description.trim().slice(0, DESCRIPTION_MAX) || undefined;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.recurring !== undefined) patch.recurring = args.recurring;
    if (args.recurrenceRule !== undefined)
      patch.recurrenceRule = args.recurrenceRule ?? undefined;
    if (args.reminderMinutesBefore !== undefined) {
      patch.reminderMinutesBefore = args.reminderMinutesBefore ?? undefined;
      // Re-arm the reminder when its timing changes.
      patch.reminderSentAt = undefined;
    }
    if (args.projectId !== undefined) {
      if (args.projectId) await assertOwnedProject(ctx, args.projectId, user._id);
      patch.projectId = args.projectId ?? undefined;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      patch.completedAt =
        args.status === "done"
          ? (task.completedAt ?? Date.now())
          : undefined;
    }

    await ctx.db.patch(args.taskId, patch);
    return null;
  },
});

// Toggle done/todo in one call (used by the list checkbox).
export const toggleTaskComplete = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const task = await requireOwnedTask(ctx, args.taskId, user._id);
    const isDone = task.status === "done";
    await ctx.db.patch(args.taskId, {
      status: isDone ? "todo" : "done",
      completedAt: isDone ? undefined : Date.now(),
      updatedAt: Date.now(),
    });
    return { done: !isDone };
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedTask(ctx, args.taskId, user._id);
    await ctx.db.delete(args.taskId);
    return null;
  },
});

// How long after a reminder's fire time we still send it (avoids missing a
// reminder if the cron lagged). Past this grace window we mark it sent silently.
const REMINDER_GRACE_MS = 60 * 60 * 1000; // 1 hour

// Cron-driven: scan tasks whose reminder hasn't been dispatched yet and create
// an in-app notification once we cross `dueDate - reminderMinutesBefore`.
// Driven by the `by_reminder` index (reminderSentAt === undefined first).
// Advance a due date to the next occurrence for a simple FREQ rule. Loops until
// the result is in the future so a long-dormant recurring task doesn't fire a
// burst of past occurrences. Returns null for unknown/one-off rules.
function nextRecurrence(
  dueDate: number,
  rule: string | undefined,
  now: number,
): number | null {
  if (!rule) return null;
  const freq = /FREQ=([A-Z]+)/.exec(rule)?.[1];
  if (!freq) return null;

  const advance = (ms: number): number => {
    const d = new Date(ms);
    switch (freq) {
      case "DAILY":
        d.setDate(d.getDate() + 1);
        break;
      case "WEEKLY":
        d.setDate(d.getDate() + 7);
        break;
      case "MONTHLY":
        d.setMonth(d.getMonth() + 1);
        break;
      case "YEARLY":
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        return NaN;
    }
    return d.getTime();
  };

  let next = advance(dueDate);
  if (Number.isNaN(next)) return null;
  let guard = 0;
  while (next <= now && guard++ < 1000) {
    const stepped = advance(next);
    if (Number.isNaN(stepped)) break;
    next = stepped;
  }
  return next;
}

export const dispatchDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const candidates = await ctx.db
      .query("tasks")
      .withIndex("by_reminder", (q) => q.eq("reminderSentAt", undefined))
      .order("asc")
      .take(200);

    let sent = 0;
    for (const task of candidates) {
      if (task.status === "done") continue;
      // A due date alone is enough to notify — default to firing AT the due time
      // when the user didn't set an explicit "minutes before" reminder.
      if (task.dueDate == null) continue;

      const minutesBefore = task.reminderMinutesBefore ?? 0;
      const fireAt = task.dueDate - minutesBefore * 60_000;
      if (now < fireAt) continue; // not time yet

      // Still within the window where acting is useful.
      if (now <= task.dueDate + REMINDER_GRACE_MS) {
        if (task.isAgentTask && task.aiInstruction) {
          // AI task: run K-AI with the instruction and deliver the result.
          await ctx.scheduler.runAfter(0, internal.agentTasks.run, {
            taskId: task._id,
          });
        } else {
          const title = `Reminder: ${task.title}`;
          // In-app notification (always).
          await ctx.runMutation(internal.notifications.create, {
            ownerId: task.ownerId,
            type: "task_reminder",
            title,
            body: task.description,
            taskId: task._id,
            chatId: task.linkedConversationId,
          });
          // External channels (email + web push) run in a Node action.
          await ctx.scheduler.runAfter(0, internal.reminderDelivery.deliver, {
            userId: task.ownerId,
            title,
            body: task.description,
            taskId: task._id,
          });
        }
        sent++;
      }

      // Recurring tasks roll forward to their next occurrence and re-arm the
      // reminder; one-off tasks are simply marked sent so we stop scanning them.
      const next = task.recurring
        ? nextRecurrence(task.dueDate, task.recurrenceRule, now)
        : null;
      if (next != null) {
        await ctx.db.patch(task._id, {
          dueDate: next,
          reminderSentAt: undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(task._id, { reminderSentAt: now });
      }
    }

    return { scanned: candidates.length, sent };
  },
});
