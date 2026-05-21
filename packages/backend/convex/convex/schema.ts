import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()), // 'active', 'canceled'
    plan: v.optional(v.string()), // 'free', 'starter_plan', 'pro_plan'
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkUserId"])
    .index("by_email", ["email"]),

  chats: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    pinnedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    source: v.object({
      provider: v.string(),
      sourceUrl: v.optional(v.string()),
      importedAt: v.number(),
      importMethod: v.union(v.literal("automatic"), v.literal("manual")),
    }),
  })
    .index("by_owner", ["ownerId"])
    .index("by_updated", ["updatedAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId"],
    }),

  messages: defineTable({
    chatId: v.id("chats"),
    ownerId: v.optional(v.id("users")),
    role: v.union(
      v.literal("system"),
      v.literal("user"),
      v.literal("assistant"),
    ),
    content: v.string(),
    createdAt: v.number(),
    order: v.number(),
    metadata: v.optional(
      v.object({
        model: v.optional(v.string()),
        tokenCount: v.optional(v.number()),
        isImported: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_chat", ["chatId"])
    .index("by_chat_order", ["chatId", "order"])
    .index("by_owner", ["ownerId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["ownerId", "role"],
    }),

  imports: defineTable({
    ownerId: v.id("users"),
    provider: v.string(),
    sourceUrl: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("success"),
      v.literal("failed"),
    ),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    messageCount: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"]),

  usage: defineTable({
    ownerId: v.id("users"),
    bucketType: v.union(
      v.literal("minute"),
      v.literal("day"),
      v.literal("month"), // free users: 30/month
      v.literal("month_premium"), // paid users: premium-model quota by tier
      v.literal("month_standard"), // paid users: standard-model quota by tier
    ),
    bucketStartMs: v.number(),
    requestCount: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_bucket", ["ownerId", "bucketType", "bucketStartMs"]),

  userSettings: defineTable({
    ownerId: v.id("users"),
    defaultModel: v.string(),
    uiPrefs: v.optional(
      v.object({
        theme: v.optional(v.string()),
        compactMode: v.optional(v.boolean()),
      }),
    ),
  }).index("by_owner", ["ownerId"]),

  files: defineTable({
    ownerId: v.id("users"),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    blobUrl: v.string(), // Full Vercel Blob URL
    pathname: v.string(), // Blob pathname/key for deletion
    filename: v.string(),
    contentType: v.string(),
    size: v.number(), // bytes
    fileType: v.union(
      v.literal("attachment"), // User uploaded
      v.literal("generated-image"), // AI generated
    ),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_chat", ["chatId"])
    .index("by_message", ["messageId"])
    .index("by_owner_chat", ["ownerId", "chatId"]),

  communityManagers: defineTable({
    email: v.string(),
    addedAt: v.number(),
  }).index("by_email", ["email"]),

  feedbackPosts: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    details: v.string(),
    type: v.union(v.literal("feature"), v.literal("bug"), v.literal("ui_ux")),
    score: v.number(),
    commentCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_score", ["score"])
    .index("by_owner", ["ownerId"]),

  feedbackComments: defineTable({
    postId: v.id("feedbackPosts"),
    ownerId: v.id("users"),
    parentId: v.optional(v.id("feedbackComments")),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_post_created", ["postId", "createdAt"])
    .index("by_owner", ["ownerId"]),

  feedbackVotes: defineTable({
    postId: v.id("feedbackPosts"),
    ownerId: v.id("users"),
    direction: v.union(v.literal("up"), v.literal("down")),
  }).index("by_post_owner", ["postId", "ownerId"]),

  // ── Canvas ──────────────────────────────────────────────
  canvasCreations: defineTable({
    ownerId: v.id("users"),
    ownerName: v.optional(v.string()),
    ownerImageUrl: v.optional(v.string()),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    mediaUrl: v.string(), // Vercel Blob URL
    pathname: v.string(), // Blob pathname for deletion
    prompt: v.string(),
    modelId: v.string(),
    aspectRatio: v.string(), // e.g. "16:9", "1:1"
    duration: v.optional(v.number()), // seconds, video only
    quality: v.optional(v.string()), // "standard" | "pro", video only
    audio: v.optional(v.boolean()), // video only
    referenceImageUrl: v.optional(v.string()),
    resolution: v.optional(v.string()),
    isPublished: v.boolean(),
    likeCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_published", ["isPublished", "likeCount"])
    .index("by_published_created", ["isPublished", "createdAt"]),

  canvasLikes: defineTable({
    creationId: v.id("canvasCreations"),
    ownerId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_creation_owner", ["creationId", "ownerId"])
    .index("by_owner", ["ownerId"]),

  videoCredits: defineTable({
    ownerId: v.id("users"),
    monthKey: v.string(), // "2026-02" format
    totalCredits: v.number(), // 300
    usedCredits: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_month", ["ownerId", "monthKey"]),

  whitelistedEmails: defineTable({
    email: v.string(),
    addedAt: v.number(),
  }).index("by_email", ["email"]),
});
