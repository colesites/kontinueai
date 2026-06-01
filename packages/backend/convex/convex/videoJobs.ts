import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Create a long-form K-Video job for the signed-in user (status pending). The
// Next route then triggers the Render worker which drives it to completion.
export const createVideoJob = mutation({
  args: {
    prompt: v.string(),
    durationSec: v.number(),
    resolution: v.string(),
    aspectRatio: v.string(),
    audio: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"videoJobs">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const now = Date.now();
    return await ctx.db.insert("videoJobs", {
      ownerId: user._id,
      prompt: args.prompt,
      durationSec: args.durationSec,
      resolution: args.resolution,
      aspectRatio: args.aspectRatio,
      audio: args.audio,
      status: "pending",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getVideoJob = query({
  args: { jobId: v.id("videoJobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return null;
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== user._id) return null;
    return job;
  },
});

export const listVideoJobs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    if (!user) return [];
    return await ctx.db
      .query("videoJobs")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(50);
  },
});

// Internal patch used by the secret-guarded callback action.
export const patchJob = internalMutation({
  args: {
    jobId: v.id("videoJobs"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    stage: v.optional(v.string()),
    finalUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...rest } = args;
    const job = await ctx.db.get(jobId);
    if (!job) return;
    await ctx.db.patch(jobId, { ...rest, updatedAt: Date.now() });

    // When the job finishes, drop the final video into the user's canvas
    // gallery so it shows up alongside normal generations.
    if (rest.status === "completed" && rest.finalUrl) {
      const owner = await ctx.db.get(job.ownerId);
      let pathname = "";
      try {
        pathname = new URL(rest.finalUrl).pathname.replace(/^\//, "");
      } catch {
        /* leave empty */
      }
      await ctx.db.insert("canvasCreations", {
        ownerId: job.ownerId,
        ownerName: owner?.name ?? undefined,
        ownerImageUrl: owner?.imageUrl ?? undefined,
        mediaType: "video",
        mediaUrl: rest.finalUrl,
        pathname,
        prompt: job.prompt,
        modelId: "kontinue/k-video-1.0",
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        duration: job.durationSec,
        audio: job.audio,
        isPublished: false,
        likeCount: 0,
        createdAt: Date.now(),
      });
    }
  },
});

// Progress/result callback from the Render worker. Guarded by AGENT_TASK_SECRET
// (the worker has no user session).
export const reportProgress = mutation({
  args: {
    jobId: v.id("videoJobs"),
    secret: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    stage: v.optional(v.string()),
    finalUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expected = process.env.AGENT_TASK_SECRET;
    if (!expected || args.secret !== expected) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Invalid secret." });
    }
    const { secret, ...patch } = args;
    void secret;
    await ctx.runMutation(internal.videoJobs.patchJob, patch);
    return null;
  },
});
