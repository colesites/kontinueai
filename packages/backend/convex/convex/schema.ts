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
    memoryUsedBytes: v.optional(v.number()),
    memoryLimitBytes: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerkUserId"])
    .index("by_email", ["email"]),

  chats: defineTable({
    ownerId: v.id("users"),
    // Optional container the chat belongs to. Null/absent = unfiled.
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    summary: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    lastMessageAt: v.optional(v.number()),
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
    .index("by_owner_project", ["ownerId", "projectId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId"],
    }),

  // ── Projects ────────────────────────────────────────────
  // Containers that group chats (and, in later slices, tasks/notes/memories).
  projects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("on_hold"),
      v.literal("completed"),
    ),
    icon: v.optional(v.string()), // lucide icon name or emoji
    color: v.optional(v.string()), // hex / token for the accent dot
    archived: v.boolean(),
    chatCount: v.number(), // denormalized counter, kept in sync by mutations
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .searchIndex("search_name", {
      searchField: "name",
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
    tokenCount: v.optional(v.number()),
    embedding: v.optional(v.array(v.float64())),
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

  memories: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("preference"),
      v.literal("personal_fact"),
      v.literal("project"),
      v.literal("long_term"),
      v.literal("summary"),
      v.literal("workflow"),
      v.literal("relationship"),
      v.literal("context"),
    ),
    content: v.string(),
    normalizedContent: v.string(),
    compressedContent: v.optional(v.string()),
    keywords: v.array(v.string()),
    embedding: v.array(v.float64()),
    importanceScore: v.number(),
    pinned: v.boolean(),
    manuallySaved: v.boolean(),
    archived: v.boolean(),
    sourceChatId: v.optional(v.id("chats")),
    sourceMessageIds: v.array(v.id("messages")),
    byteSize: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastAccessedAt: v.number(),
  })
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_last_accessed", ["userId", "lastAccessedAt"])
    .index("by_user_type", ["userId", "type"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["userId", "type", "pinned", "archived"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId", "type", "pinned", "archived"],
    }),

  memorySummaries: defineTable({
    userId: v.id("users"),
    periodType: v.union(
      v.literal("conversation"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    periodStart: v.number(),
    periodEnd: v.number(),
    summary: v.string(),
    embedding: v.array(v.float64()),
    byteSize: v.number(),
    sourceChatId: v.optional(v.id("chats")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_period", ["userId", "periodType", "periodStart"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .searchIndex("search_summary", {
      searchField: "summary",
      filterFields: ["userId", "periodType"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId", "periodType"],
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

  importJobs: defineTable({
    ownerId: v.id("users"),
    provider: v.string(), // "chatgpt" | "claude" | "kontinue"
    // R2 object key for the uploaded raw export (set during upload),
    // later swapped to the parsed-list key once parsing completes.
    sourceObjectKey: v.optional(v.string()),
    sourceFilename: v.optional(v.string()),
    sourceContentType: v.optional(v.string()),
    uploadByteSize: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    currentStage: v.optional(v.string()), // "parsing" | "phase1" | "phase2" | "done"
    totalConversations: v.number(),
    processedConversations: v.number(),
    importedMessages: v.number(),
    totalChunks: v.number(),
    completedChunks: v.number(),
    progress: v.number(), // 0..1
    phase1CompletedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_status", ["status"]),

  importChunks: defineTable({
    jobId: v.id("importJobs"),
    ownerId: v.id("users"),
    priority: v.number(), // 1 = oldest, 2 = newest, 3 = middle
    chunkType: v.union(
      v.literal("oldest"),
      v.literal("newest"),
      v.literal("middle"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    // Indices into the parsed conversation list stored in storage.
    rangeStart: v.number(),
    rangeEnd: v.number(),
    conversationCount: v.number(),
    retryCount: v.number(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_job", ["jobId"])
    .index("by_job_priority_status", ["jobId", "priority", "status"])
    .index("by_status", ["status"]),

  dataExports: defineTable({
    ownerId: v.id("users"),
    format: v.union(
      v.literal("json"),
      v.literal("markdown"),
      v.literal("zip"),
    ),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    // R2 object key of the finished archive.
    objectKey: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    conversationCount: v.optional(v.number()),
    memoryCount: v.optional(v.number()),
    summaryCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    // Soft expiry; UI hints user to download soon.
    expiresAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_created", ["ownerId", "createdAt"]),

  usage: defineTable({
    ownerId: v.id("users"),
    bucketType: v.union(
      v.literal("minute"),
      v.literal("day"),
      v.literal("month"), // free users: 30/month
      v.literal("month_premium"), // paid users: premium-model quota by tier
      v.literal("month_standard"), // paid users: standard-model quota by tier
      v.literal("month_kai"), // K-AI 1.0: separate monthly request budget
      v.literal("day_kai_search"), // K-AI 1.0: daily web-search budget
    ),
    bucketStartMs: v.number(),
    requestCount: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_bucket", ["ownerId", "bucketType", "bucketStartMs"]),

  // Global cache of web-search results (not per-user) so identical queries reuse
  // a recent answer instead of re-hitting the search provider. Keyed by a
  // normalized query hash; rows expire via expiresAt (checked at read time).
  webSearchCache: defineTable({
    queryKey: v.string(), // normalized + hashed query
    query: v.string(), // original (display) query
    contextText: v.string(), // built context block injected into the prompt
    sources: v.array(
      v.object({
        title: v.string(),
        url: v.string(),
        snippet: v.optional(v.string()),
      }),
    ),
    provider: v.string(), // which provider produced this (tavily/brave)
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_query_key", ["queryKey"]),

  userSettings: defineTable({
    ownerId: v.id("users"),
    defaultModel: v.string(),
    uiPrefs: v.optional(
      v.object({
        theme: v.optional(v.string()),
        compactMode: v.optional(v.boolean()),
      }),
    ),
    // Reminder delivery channels. Absent = use defaults (email + push on).
    reminderChannels: v.optional(
      v.object({
        email: v.optional(v.boolean()),
        push: v.optional(v.boolean()),
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

  // ── Tasks ───────────────────────────────────────────────
  tasks: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()), // epoch ms
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("done"),
    ),
    recurring: v.boolean(),
    recurrenceRule: v.optional(v.string()), // RRULE-ish string, null when not recurring
    // AI task: when isAgentTask, the scheduler runs K-AI with `aiInstruction`
    // (under the optional `agentId` persona) at the due time and delivers the
    // result, instead of just sending a reminder.
    isAgentTask: v.optional(v.boolean()),
    aiInstruction: v.optional(v.string()),
    agentId: v.optional(v.string()),
    linkedConversationId: v.optional(v.id("chats")),
    linkedMemoryIds: v.optional(v.array(v.id("memories"))),
    createdByAgent: v.optional(v.string()), // agent id if AI-created, else undefined
    // Reminder offset in minutes before dueDate (null = no reminder).
    reminderMinutesBefore: v.optional(v.number()),
    // Set when a reminder has been dispatched, to avoid duplicate sends.
    reminderSentAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_due", ["ownerId", "dueDate"])
    .index("by_project", ["projectId"])
    // Drives the reminder cron: find tasks with a pending reminder by due date.
    .index("by_reminder", ["reminderSentAt", "dueDate"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId", "status"],
    }),

  // In-app notifications (reminders, task alerts, system messages).
  notifications: defineTable({
    ownerId: v.id("users"),
    type: v.union(
      v.literal("task_reminder"),
      v.literal("task_overdue"),
      v.literal("system"),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    // Deep-link target so clicking the notification navigates correctly.
    taskId: v.optional(v.id("tasks")),
    chatId: v.optional(v.id("chats")),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_owner_read", ["ownerId", "read"]),

  // Web Push subscriptions (one row per browser/device the user enabled push on).
  pushSubscriptions: defineTable({
    ownerId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(), // client public key
    auth: v.string(), // client auth secret
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_endpoint", ["endpoint"]),

  // ── Connectors ──────────────────────────────────────────
  // Third-party OAuth integrations (GitHub, Gmail, Notion, …). Access/refresh
  // tokens are AES-GCM encrypted at rest — NEVER stored in plaintext.
  connectors: defineTable({
    ownerId: v.id("users"),
    provider: v.string(), // "github" | "gmail" | "notion" | "google_calendar" | …
    accessTokenEncrypted: v.string(), // base64(iv || ciphertext+tag)
    refreshTokenEncrypted: v.optional(v.string()),
    scopes: v.array(v.string()),
    connected: v.boolean(),
    // Human-readable account label (e.g. GitHub login) for the UI.
    accountLabel: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_provider", ["ownerId", "provider"]),

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
