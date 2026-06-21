import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { readCreditState } from "./lib/videoCredits";

async function authenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

const CODE_LENGTH = 8;

// Short, uppercase, URL-safe code derived from a random UUID.
function randomCode(): string {
  return crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, CODE_LENGTH)
    .toUpperCase();
}

// Return the current user's invite code, generating (and persisting) a unique
// one on first use. Called by the Settings → Invite panel.
export const ensureReferralCode = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    const user = await authenticatedUser(ctx);
    if (user.referralCode) return user.referralCode;

    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q) => q.eq("referralCode", code))
        .first();
      if (!clash) break;
      code = randomCode();
    }

    await ctx.db.patch(user._id, { referralCode: code });
    return code;
  },
});

// Stats for the Invite panel: the user's code (if generated), how many people
// they've invited, how many converted (paid), and their bonus credit balance.
export const getReferralSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await authenticatedUser(ctx);

    // A single user's referral list stays small; bound the read defensively.
    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerUserId", user._id))
      .take(500);

    const invitedCount = referrals.length;
    const convertedCount = referrals.filter(
      (r) => r.status === "rewarded",
    ).length;

    const state = await readCreditState(ctx, user);

    return {
      code: user.referralCode ?? null,
      invitedCount,
      convertedCount,
      bonusTotal: state.bonus.total,
      bonusUsed: state.bonus.used,
      bonusRemaining: state.bonus.remaining,
    };
  },
});
