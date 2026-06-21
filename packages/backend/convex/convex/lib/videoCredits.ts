import { planTierFromPersisted } from "@repo/core/plan-tier";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Video-credit accounting shared by canvas.ts (spend) and users.ts (referral
// reward grants). Two pools live in the `videoCredits` table per user:
//   • monthly  → monthKey "YYYY-MM", resets each month, MONTHLY_CREDITS total.
//                Only Pro users can spend it on video.
//   • bonus    → reserved monthKey "bonus", persistent (never resets). Granted
//                via the referral program; spendable by ANY plan tier, which is
//                what lets a free/Starter inviter generate video at all.

export const MONTHLY_CREDITS = 300;
export const BONUS_MONTH_KEY = "bonus";
export const REFERRAL_REWARD_CREDITS = 100;

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type CreditPool = { total: number; used: number; remaining: number };

export type CreditState = {
  monthKey: string;
  isPro: boolean;
  monthly: CreditPool;
  bonus: CreditPool;
  // Effective credits the user can actually spend on a video right now.
  available: number;
};

function creditRow(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  monthKey: string,
) {
  return ctx.db
    .query("videoCredits")
    .withIndex("by_owner_month", (q) =>
      q.eq("ownerId", ownerId).eq("monthKey", monthKey),
    )
    .first();
}

export async function readCreditState(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<CreditState> {
  const monthKey = currentMonthKey();
  const isPro = planTierFromPersisted(user.plan) === "pro";

  const monthlyRow = await creditRow(ctx, user._id, monthKey);
  const bonusRow = await creditRow(ctx, user._id, BONUS_MONTH_KEY);

  const monthlyUsed = monthlyRow?.usedCredits ?? 0;
  const monthly: CreditPool = {
    total: MONTHLY_CREDITS,
    used: monthlyUsed,
    remaining: Math.max(0, MONTHLY_CREDITS - monthlyUsed),
  };

  const bonusTotal = bonusRow?.totalCredits ?? 0;
  const bonusUsed = bonusRow?.usedCredits ?? 0;
  const bonus: CreditPool = {
    total: bonusTotal,
    used: bonusUsed,
    remaining: Math.max(0, bonusTotal - bonusUsed),
  };

  // Only Pro users can draw on the monthly allowance for video; the bonus pool
  // is available to everyone.
  const available = (isPro ? monthly.remaining : 0) + bonus.remaining;

  return { monthKey, isPro, monthly, bonus, available };
}

// Deduct `cost` credits, drawing from the monthly allowance first (Pro only)
// then the persistent bonus pool. Throws if the user lacks sufficient credits.
export async function consumeVideoCredits(
  ctx: MutationCtx,
  user: Doc<"users">,
  cost: number,
): Promise<{ remaining: number }> {
  if (cost <= 0) {
    const state = await readCreditState(ctx, user);
    return { remaining: state.available };
  }

  const monthKey = currentMonthKey();
  const isPro = planTierFromPersisted(user.plan) === "pro";
  const now = Date.now();

  const monthlyRow = await creditRow(ctx, user._id, monthKey);
  const bonusRow = await creditRow(ctx, user._id, BONUS_MONTH_KEY);

  const monthlyUsed = monthlyRow?.usedCredits ?? 0;
  const monthlyRemaining = isPro
    ? Math.max(0, MONTHLY_CREDITS - monthlyUsed)
    : 0;
  const bonusTotal = bonusRow?.totalCredits ?? 0;
  const bonusUsed = bonusRow?.usedCredits ?? 0;
  const bonusRemaining = Math.max(0, bonusTotal - bonusUsed);

  const available = monthlyRemaining + bonusRemaining;
  if (cost > available) {
    throw new Error(
      `Insufficient credits. ${available} remaining, need ${cost}.`,
    );
  }

  const fromMonthly = Math.min(cost, monthlyRemaining);
  const fromBonus = cost - fromMonthly;

  if (fromMonthly > 0) {
    if (monthlyRow) {
      await ctx.db.patch(monthlyRow._id, {
        usedCredits: monthlyUsed + fromMonthly,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("videoCredits", {
        ownerId: user._id,
        monthKey,
        totalCredits: MONTHLY_CREDITS,
        usedCredits: fromMonthly,
        updatedAt: now,
      });
    }
  }

  if (fromBonus > 0) {
    // bonusRemaining > 0 implies bonusRow exists; the insert is a defensive
    // fallback only.
    if (bonusRow) {
      await ctx.db.patch(bonusRow._id, {
        usedCredits: bonusUsed + fromBonus,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("videoCredits", {
        ownerId: user._id,
        monthKey: BONUS_MONTH_KEY,
        totalCredits: fromBonus,
        usedCredits: fromBonus,
        updatedAt: now,
      });
    }
  }

  return { remaining: available - cost };
}

// Add `amount` credits to the persistent bonus pool (referral reward).
export async function grantBonusCredits(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const now = Date.now();
  const bonusRow = await creditRow(ctx, ownerId, BONUS_MONTH_KEY);
  if (bonusRow) {
    await ctx.db.patch(bonusRow._id, {
      totalCredits: bonusRow.totalCredits + amount,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("videoCredits", {
      ownerId,
      monthKey: BONUS_MONTH_KEY,
      totalCredits: amount,
      usedCredits: 0,
      updatedAt: now,
    });
  }
}
