import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const PROJECT_STATUS = v.union(
  v.literal("active"),
  v.literal("on_hold"),
  v.literal("completed"),
);

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

// Resolve the authenticated app user (the `users` row), throwing if absent.
async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

// Fetch a project and assert it belongs to the given user.
async function requireOwnedProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project || project.ownerId !== userId) {
    throw new ConvexError({
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
    });
  }
  return project;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "INVALID_NAME",
      message: "Project name cannot be empty.",
    });
  }
  return trimmed.slice(0, NAME_MAX);
}

export const listProjects = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner_updated", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(200);

    return args.includeArchived
      ? projects
      : projects.filter((p) => !p.archived);
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await requireOwnedProject(ctx, args.projectId, user._id);
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(PROJECT_STATUS),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      ownerId: user._id,
      name: normalizeName(args.name),
      description: args.description?.trim().slice(0, DESCRIPTION_MAX) || undefined,
      status: args.status ?? "active",
      icon: args.icon,
      color: args.color,
      archived: false,
      chatCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return projectId;
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(PROJECT_STATUS),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedProject(ctx, args.projectId, user._id);

    const patch: Partial<Doc<"projects">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = normalizeName(args.name);
    if (args.description !== undefined)
      patch.description = args.description.trim().slice(0, DESCRIPTION_MAX) || undefined;
    if (args.status !== undefined) patch.status = args.status;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.color !== undefined) patch.color = args.color;

    await ctx.db.patch(args.projectId, patch);
    return null;
  },
});

export const setProjectArchived = mutation({
  args: { projectId: v.id("projects"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedProject(ctx, args.projectId, user._id);
    await ctx.db.patch(args.projectId, {
      archived: args.archived,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// Delete a project. Chats are unfiled (projectId cleared) rather than deleted.
export const deleteProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedProject(ctx, args.projectId, user._id);

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_owner_project", (q) =>
        q.eq("ownerId", user._id).eq("projectId", args.projectId),
      )
      .take(500);
    for (const chat of chats) {
      await ctx.db.patch(chat._id, { projectId: undefined });
    }

    await ctx.db.delete(args.projectId);
    return null;
  },
});

// Move a chat into a project (or out of one when projectId is null).
export const assignChatToProject = mutation({
  args: {
    chatId: v.id("chats"),
    projectId: v.union(v.id("projects"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.ownerId !== user._id) {
      throw new ConvexError({
        code: "CHAT_NOT_FOUND",
        message: "Chat not found.",
      });
    }

    const previousProjectId = chat.projectId ?? null;
    const nextProjectId = args.projectId ?? null;
    if (previousProjectId === nextProjectId) return null;

    if (nextProjectId) {
      await requireOwnedProject(ctx, nextProjectId, user._id);
    }

    await ctx.db.patch(args.chatId, {
      projectId: nextProjectId ?? undefined,
    });

    // Keep denormalized chatCount in sync on both sides of the move.
    if (previousProjectId) {
      const prev = await ctx.db.get(previousProjectId);
      if (prev) {
        await ctx.db.patch(previousProjectId, {
          chatCount: Math.max(0, prev.chatCount - 1),
          updatedAt: Date.now(),
        });
      }
    }
    if (nextProjectId) {
      const next = await ctx.db.get(nextProjectId);
      if (next) {
        await ctx.db.patch(nextProjectId, {
          chatCount: next.chatCount + 1,
          updatedAt: Date.now(),
        });
      }
    }

    return null;
  },
});

// List chats inside a project, sorted for the sidebar (pinned first, recent).
export const listProjectChats = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireOwnedProject(ctx, args.projectId, user._id);

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_owner_project", (q) =>
        q.eq("ownerId", user._id).eq("projectId", args.projectId),
      )
      .take(500);

    return chats
      .filter((c) => !c.archived)
      .sort((a, b) => {
        const aPin = a.pinnedAt && a.pinnedAt > 0 ? a.pinnedAt : null;
        const bPin = b.pinnedAt && b.pinnedAt > 0 ? b.pinnedAt : null;
        if (aPin !== null || bPin !== null) {
          if (aPin === null) return 1;
          if (bPin === null) return -1;
          if (aPin !== bPin) return bPin - aPin;
        }
        return b.updatedAt - a.updatedAt;
      });
  },
});
