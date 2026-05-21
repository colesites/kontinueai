import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getPersistedPlanTier, isPersistedPaidPlan } from "../lib/plan";
import {
  getMonthlyAutomaticImportLimit,
  getUtcMonthRange,
} from "../lib/import_limits";
import { internal } from "./_generated/api";

const FREE_MONTHLY_LIMIT = 30;
const STARTER_PREMIUM_LIMIT = 30;
const STARTER_STANDARD_LIMIT = 270;
const PRO_PREMIUM_LIMIT = 100;
const PRO_STANDARD_LIMIT = 1400;

function getPaidPlanLimits(planTier: "starter" | "pro"): {
  label: "Starter" | "Pro";
  premiumLimit: number;
  standardLimit: number;
} {
  if (planTier === "pro") {
    return {
      label: "Pro",
      premiumLimit: PRO_PREMIUM_LIMIT,
      standardLimit: PRO_STANDARD_LIMIT,
    };
  }

  return {
    label: "Starter",
    premiumLimit: STARTER_PREMIUM_LIMIT,
    standardLimit: STARTER_STANDARD_LIMIT,
  };
}

export const getMessages = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      return [];
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();
  },
});

export const addMessage = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.string()),
    isPremiumModel: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Rate limiting (requests only): apply to user messages
    if (args.role === "user") {
      const planTier = getPersistedPlanTier(user.plan);
      const isPaidPlan = isPersistedPaidPlan(user.plan);
      const RPM_LIMIT = isPaidPlan ? 10 : 5;

      const nowMs = Date.now();
      const minuteBucketStartMs = Math.floor(nowMs / 60_000) * 60_000;
      // Monthly bucket start: first ms of current UTC calendar month
      const d = new Date(nowMs);
      const monthBucketStartMs = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        1,
      );

      const premiumBucketType = "month_premium" as const;
      const standardBucketType = "month_standard" as const;

      if (isPaidPlan) {
        const paidPlanTier = planTier === "pro" ? "pro" : "starter";
        const limits = getPaidPlanLimits(paidPlanTier);
        const isModelPremium = args.isPremiumModel ?? false;
        const activeBucketType = isModelPremium
          ? premiumBucketType
          : standardBucketType;
        const activeLimit = isModelPremium
          ? limits.premiumLimit
          : limits.standardLimit;

        const [minuteUsage, periodicUsage] = await Promise.all([
          ctx.db
            .query("usage")
            .withIndex("by_owner_bucket", (q) =>
              q
                .eq("ownerId", user._id)
                .eq("bucketType", "minute")
                .eq("bucketStartMs", minuteBucketStartMs),
            )
            .unique(),
          ctx.db
            .query("usage")
            .withIndex("by_owner_bucket", (q) =>
              q
                .eq("ownerId", user._id)
                .eq("bucketType", activeBucketType)
                .eq("bucketStartMs", monthBucketStartMs),
            )
            .unique(),
        ]);

        const minuteCount = minuteUsage?.requestCount ?? 0;
        const periodicCount = periodicUsage?.requestCount ?? 0;

        if (minuteCount >= RPM_LIMIT) {
          throw new ConvexError({
            code: "RATE_LIMIT_RPM",
            message: `Rate limit reached (${RPM_LIMIT} requests/min). Please wait and try again.`,
          });
        }
        if (periodicCount >= activeLimit) {
          throw new ConvexError({
            code:
              paidPlanTier === "pro"
                ? isModelPremium
                  ? "RATE_LIMIT_PRO_PREMIUM"
                  : "RATE_LIMIT_PRO_STANDARD"
                : isModelPremium
                  ? "RATE_LIMIT_STARTER_PREMIUM"
                  : "RATE_LIMIT_STARTER_STANDARD",
            message: isModelPremium
              ? `Monthly premium-model limit reached (${limits.premiumLimit} messages/month on premium models for the ${limits.label} plan). Switch to a standard model or try again next month.`
              : `Monthly standard-model limit reached (${limits.standardLimit} messages/month on standard models for the ${limits.label} plan). Try again next month.`,
          });
        }

        // Increment usage
        if (minuteUsage) {
          await ctx.db.patch(minuteUsage._id, {
            requestCount: minuteCount + 1,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("usage", {
            ownerId: user._id,
            bucketType: "minute",
            bucketStartMs: minuteBucketStartMs,
            requestCount: 1,
            updatedAt: nowMs,
          });
        }
        if (periodicUsage) {
          await ctx.db.patch(periodicUsage._id, {
            requestCount: periodicCount + 1,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("usage", {
            ownerId: user._id,
            bucketType: activeBucketType,
            bucketStartMs: monthBucketStartMs,
            requestCount: 1,
            updatedAt: nowMs,
          });
        }
      } else {
        // ── Free users ───────────────────────────────────────────────────────────
        const [minuteUsage, monthUsage] = await Promise.all([
          ctx.db
            .query("usage")
            .withIndex("by_owner_bucket", (q) =>
              q
                .eq("ownerId", user._id)
                .eq("bucketType", "minute")
                .eq("bucketStartMs", minuteBucketStartMs),
            )
            .unique(),
          ctx.db
            .query("usage")
            .withIndex("by_owner_bucket", (q) =>
              q
                .eq("ownerId", user._id)
                .eq("bucketType", "month")
                .eq("bucketStartMs", monthBucketStartMs),
            )
            .unique(),
        ]);

        const minuteCount = minuteUsage?.requestCount ?? 0;
        const monthCount = monthUsage?.requestCount ?? 0;

        if (minuteCount >= RPM_LIMIT) {
          throw new ConvexError({
            code: "RATE_LIMIT_RPM",
            message: `Rate limit reached (${RPM_LIMIT} requests/min). Please wait and try again.`,
          });
        }
        if (monthCount >= FREE_MONTHLY_LIMIT) {
          throw new ConvexError({
            code: "RATE_LIMIT_MONTHLY",
            message: `Monthly message limit reached (${FREE_MONTHLY_LIMIT} messages/month). Please try again next month or upgrade to Starter or Pro.`,
          });
        }

        // Increment usage
        if (minuteUsage) {
          await ctx.db.patch(minuteUsage._id, {
            requestCount: minuteCount + 1,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("usage", {
            ownerId: user._id,
            bucketType: "minute",
            bucketStartMs: minuteBucketStartMs,
            requestCount: 1,
            updatedAt: nowMs,
          });
        }
        if (monthUsage) {
          await ctx.db.patch(monthUsage._id, {
            requestCount: monthCount + 1,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("usage", {
            ownerId: user._id,
            bucketType: "month",
            bucketStartMs: monthBucketStartMs,
            requestCount: 1,
            updatedAt: nowMs,
          });
        }
      }
    }

    // Get the highest order number
    const lastMessage = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .first();

    const order = lastMessage ? lastMessage.order + 1 : 0;
    const now = Date.now();

    if (
      args.role === "user" &&
      order === 0 &&
      chat.title === "New Conversation"
    ) {
      // Schedule title generation as a background action
      await ctx.scheduler.runAfter(
        0,
        internal.titleGenerator.generateAndUpdateTitle,
        {
          chatId: args.chatId,
          firstMessage: args.content,
        },
      );
    }

    const messageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      ownerId: user._id,
      role: args.role,
      content: args.content,
      createdAt: now,
      order,
      metadata: {
        model: args.model,
        isImported: false,
      },
    });

    // Update chat's updatedAt
    await ctx.db.patch(args.chatId, {
      updatedAt: now,
    });

    return messageId;
  },
});

export const updateMessageContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const chat = await ctx.db.get(message.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
    });
  },
});

/**
 * Delete every message in a chat that was created at or after the given message.
 * Used by the "edit user message" flow: when a user edits a turn, the assistant's
 * reply (and any subsequent turns) become stale and must be removed before
 * regeneration.
 */
export const deleteMessagesAfter = mutation({
  args: {
    messageId: v.id("messages"),
    /** If true, the message at messageId is preserved (only later ones are deleted). */
    inclusive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const target = await ctx.db.get(args.messageId);
    if (!target) {
      throw new Error("Message not found");
    }

    const chat = await ctx.db.get(target.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    const cutoff = target._creationTime;
    const inclusive = args.inclusive ?? false;

    const laterMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", target.chatId))
      .filter((q) =>
        inclusive
          ? q.gte(q.field("_creationTime"), cutoff)
          : q.gt(q.field("_creationTime"), cutoff),
      )
      .collect();

    await Promise.all(laterMessages.map((m) => ctx.db.delete(m._id)));
  },
});

// Internal mutation to update chat title (bypasses auth checks)
export const updateChatTitleInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/** Returns usage for the logged-in user:
 *  - monthly message usage
 *  - monthly automatic import usage
 *  Used by the Settings page usage tracker. */
export const getMonthlyUsage = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) return null;

    const nowMs = Date.now();
    const { monthStartMs, monthEndMs } = getUtcMonthRange(nowMs);
    const monthBucketStartMs = monthStartMs;
    const planTier = getPersistedPlanTier(user.plan);

    const [freeMonthly, proPremium, proStandard, chats] = await Promise.all([
      ctx.db
        .query("usage")
        .withIndex("by_owner_bucket", (q) =>
          q.eq("ownerId", user._id).eq("bucketType", "month").eq("bucketStartMs", monthBucketStartMs),
        )
        .unique(),
      ctx.db
        .query("usage")
        .withIndex("by_owner_bucket", (q) =>
          q.eq("ownerId", user._id).eq("bucketType", "month_premium").eq("bucketStartMs", monthBucketStartMs),
        )
        .unique(),
      ctx.db
        .query("usage")
        .withIndex("by_owner_bucket", (q) =>
          q.eq("ownerId", user._id).eq("bucketType", "month_standard").eq("bucketStartMs", monthBucketStartMs),
        )
        .unique(),
      ctx.db
        .query("chats")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .collect(),
    ]);

    const isPaid = planTier !== "free";
    const paidTier = planTier === "pro" ? "pro" : "starter";
    const paidLimits = getPaidPlanLimits(paidTier);
    const paidPremiumUsed = proPremium?.requestCount ?? 0;
    const paidStandardUsed = proStandard?.requestCount ?? 0;
    const paidTotalUsed = paidPremiumUsed + paidStandardUsed;
    const paidPremiumLimit = isPaid ? paidLimits.premiumLimit : 0;
    const paidStandardLimit = isPaid ? paidLimits.standardLimit : 0;
    const paidTotalLimit = paidPremiumLimit + paidStandardLimit;
    const monthlyImportUsed = chats.filter(
      (chat) =>
        chat.source.importMethod === "automatic" &&
        chat.source.importedAt >= monthStartMs &&
        chat.source.importedAt < monthEndMs,
    ).length;
    const monthlyImportLimit = getMonthlyAutomaticImportLimit(planTier);

    return {
      planTier,
      isPaid,
      // Free tier
      freeMonthlyUsed: freeMonthly?.requestCount ?? 0,
      freeMonthlyLimit: FREE_MONTHLY_LIMIT,
      // Paid tiers (Starter and Pro)
      paidPremiumUsed,
      paidPremiumLimit,
      paidStandardUsed,
      paidStandardLimit,
      paidTotalUsed,
      paidTotalLimit,
      monthlyImportUsed,
      monthlyImportLimit,
    };
  },
});
