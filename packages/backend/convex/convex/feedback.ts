import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

const DEFAULT_POST_LIMIT = 100;
const MAX_POST_LIMIT = 200;
const TITLE_MAX_LENGTH = 120;
const DETAILS_MAX_LENGTH = 2000;
const COMMENT_MAX_LENGTH = 500;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_POST_LIMIT;
  const safe = Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_POST_LIMIT;
  return Math.max(1, Math.min(MAX_POST_LIMIT, safe));
}

function requireNonEmptyTrimmed(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `${field} is required.`,
    });
  }
  return trimmed;
}

async function getOrCreateAuthenticatedUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Please sign in to continue.",
    });
  }

  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (existingUser) {
    return existingUser;
  }

  const now = Date.now();
  const fallbackEmail = identity.email?.trim() || `${identity.subject}@clerk.local`;
  const userId = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email: fallbackEmail,
    name: identity.name ?? undefined,
    imageUrl: identity.pictureUrl ?? undefined,
    subscriptionStatus: "inactive",
    plan: "free",
    memoryUsedBytes: 0,
    memoryLimitBytes: 512 * 1024,
    createdAt: now,
    updatedAt: now,
  });

  const inserted = await ctx.db.get(userId);
  if (!inserted) {
    throw new ConvexError({
      code: "INTERNAL_ERROR",
      message: "Unable to resolve user record.",
    });
  }
  return inserted;
}

export const listPosts = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit);
    const posts = await ctx.db
      .query("feedbackPosts")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    const identity = await ctx.auth.getUserIdentity();
    let currentUserId: string | null = null;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
        .unique();
      currentUserId = user?._id ?? null;
    }

    const communityManagers = await ctx.db.query("communityManagers").collect();
    const cmEmails = new Set(communityManagers.map(cm => cm.email));

    return await Promise.all(
      posts.map(async (post) => {
        const comments = await ctx.db
          .query("feedbackComments")
          .withIndex("by_post_created", (q) => q.eq("postId", post._id))
          .order("asc")
          .collect();

        const commentsWithAuthors = await Promise.all(
          comments.map(async (comment) => {
            const author = await ctx.db.get(comment.ownerId);
            return {
              id: comment._id,
              parentId: comment.parentId,
              body: comment.body,
              createdAt: comment.createdAt,
              authorName: author?.name ?? "Anonymous",
              authorImage: author?.imageUrl,
              isCommunityManager: author ? cmEmails.has(author.email) : false,
            };
          }),
        );

        return {
          id: post._id,
          title: post.title,
          details: post.details,
          type: post.type,
          score: post.score,
          createdAt: post.createdAt,
          commentCount: post.commentCount,
          isOwner: currentUserId === post.ownerId,
          comments: commentsWithAuthors,
        };
      }),
    );
  },
});

export const createPost = mutation({
  args: {
    title: v.string(),
    details: v.string(),
    type: v.union(v.literal("feature"), v.literal("bug"), v.literal("ui_ux")),
  },
  handler: async (ctx, args) => {
    const owner = await getOrCreateAuthenticatedUser(ctx);
    const title = requireNonEmptyTrimmed(args.title, "Title");
    const details = requireNonEmptyTrimmed(args.details, "Details");

    if (title.length > TITLE_MAX_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
      });
    }
    if (details.length > DETAILS_MAX_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Details must be ${DETAILS_MAX_LENGTH} characters or fewer.`,
      });
    }

    const now = Date.now();
    return await ctx.db.insert("feedbackPosts", {
      ownerId: owner._id,
      title,
      details,
      type: args.type,
      score: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const votePost = mutation({
  args: {
    postId: v.id("feedbackPosts"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateAuthenticatedUser(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found.",
      });
    }

    const existingVote = await ctx.db
      .query("feedbackVotes")
      .withIndex("by_post_owner", (q) =>
        q.eq("postId", args.postId).eq("ownerId", user._id),
      )
      .unique();

    let scoreDelta = 0;

    if (existingVote) {
      if (existingVote.direction === args.direction) {
        // Same direction → toggle off (remove vote)
        await ctx.db.delete(existingVote._id);
        scoreDelta = args.direction === "up" ? -1 : 1;
      } else {
        // Opposite direction → switch vote (swing by 2)
        await ctx.db.patch(existingVote._id, { direction: args.direction });
        scoreDelta = args.direction === "up" ? 2 : -2;
      }
    } else {
      // No existing vote → create one
      await ctx.db.insert("feedbackVotes", {
        postId: args.postId,
        ownerId: user._id,
        direction: args.direction,
      });
      scoreDelta = args.direction === "up" ? 1 : -1;
    }

    const nextScore = post.score + scoreDelta;
    await ctx.db.patch(post._id, {
      score: nextScore,
      updatedAt: Date.now(),
    });

    return { score: nextScore };
  },
});

export const addComment = mutation({
  args: {
    postId: v.id("feedbackPosts"),
    parentId: v.optional(v.id("feedbackComments")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await getOrCreateAuthenticatedUser(ctx);
    const body = requireNonEmptyTrimmed(args.body, "Comment");

    if (body.length > COMMENT_MAX_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.`,
      });
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found.",
      });
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.postId !== args.postId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid parent comment." });
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("feedbackComments", {
      postId: post._id,
      parentId: args.parentId,
      ownerId: owner._id,
      body,
      createdAt: now,
    });

    await ctx.db.patch(post._id, {
      commentCount: post.commentCount + 1,
      updatedAt: now,
    });

    return commentId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("feedbackPosts"),
    title: v.string(),
    details: v.string(),
    type: v.union(v.literal("feature"), v.literal("bug"), v.literal("ui_ux")),
  },
  handler: async (ctx, args) => {
    const owner = await getOrCreateAuthenticatedUser(ctx);
    const title = requireNonEmptyTrimmed(args.title, "Title");
    const details = requireNonEmptyTrimmed(args.details, "Details");

    if (title.length > TITLE_MAX_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`,
      });
    }
    if (details.length > DETAILS_MAX_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Details must be ${DETAILS_MAX_LENGTH} characters or fewer.`,
      });
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Post not found." });
    }

    if (post.ownerId !== owner._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "You do not have permission to edit this post." });
    }

    await ctx.db.patch(args.postId, {
      title,
      details,
      type: args.type,
      updatedAt: Date.now(),
    });

    return true;
  },
});

export const deletePost = mutation({
  args: {
    postId: v.id("feedbackPosts"),
  },
  handler: async (ctx, args) => {
    const owner = await getOrCreateAuthenticatedUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) return false;

    if (post.ownerId !== owner._id) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "You do not have permission to delete this post." });
    }

    // Delete all comments
    const comments = await ctx.db
      .query("feedbackComments")
      .withIndex("by_post_created", (q) => q.eq("postId", args.postId))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete all votes
    const votes = await ctx.db
      .query("feedbackVotes")
      .withIndex("by_post_owner", (q) => q.eq("postId", args.postId))
      .collect();
    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete post
    await ctx.db.delete(args.postId);
    
    return true;
  },
});
