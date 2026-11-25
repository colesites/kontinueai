"use node";

// Push delivery shared by Node actions (reminderDelivery.ts, kodeRemoteNotify.ts).
// Import only from files marked "use node": web-push needs Node built-ins.

import webpush from "web-push";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

let vapidConfigured: boolean | null = null;

// Configure web-push once per cold start. Returns false when VAPID keys are
// absent so callers can skip push delivery instead of throwing.
function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@kontinue.ai";
  if (!publicKey || !privateKey) {
    vapidConfigured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

// Send to the mobile app via Expo's push service. No SDK needed — the HTTP
// API accepts up to 100 messages per request. Returns tokens Expo reported
// as dead (DeviceNotRegistered) so the caller can prune them.
async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data: Record<string, string> },
): Promise<string[]> {
  if (tokens.length === 0) return [];
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: "default",
      })),
    ),
  });
  if (!res.ok) {
    console.error("[push] expo push send failed", res.status, await res.text());
    return [];
  }
  const json = (await res.json()) as {
    data?: Array<{ status: string; details?: { error?: string } }>;
  };
  const dead: string[] = [];
  (json.data ?? []).forEach((ticket, i) => {
    if (ticket.status === "error") {
      if (ticket.details?.error === "DeviceNotRegistered") {
        const token = tokens[i];
        if (token) dead.push(token);
      } else {
        console.error("[push] expo push ticket error", ticket);
      }
    }
  });
  return dead;
}

/** Mobile push to every Expo token the user registered. */
export async function pushToMobile(
  ctx: ActionCtx,
  userId: Id<"users">,
  message: { title: string; body: string; data: Record<string, string> },
): Promise<void> {
  try {
    const expoTokens = await ctx.runQuery(internal.push.getExpoTokensForUser, {
      userId,
    });
    const dead = await sendExpoPush(
      expoTokens.map((t) => t.token),
      message,
    );
    for (const token of dead) {
      await ctx.runMutation(internal.push.removeExpoTokenByToken, { token });
    }
  } catch (error) {
    console.error("[push] expo push error", error);
  }
}

/** Browser push to every web subscription the user registered. */
export async function pushToWeb(
  ctx: ActionCtx,
  userId: Id<"users">,
  message: { title: string; body: string; url: string },
): Promise<void> {
  if (!ensureVapid()) return;
  const subs = await ctx.runQuery(internal.push.getSubscriptionsForUser, {
    userId,
  });
  const payload = JSON.stringify(message);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is dead — prune it so we stop retrying.
          await ctx.runMutation(internal.push.removeSubscriptionByEndpoint, {
            endpoint: sub.endpoint,
          });
        } else {
          console.error("[push] web push error", statusCode, error);
        }
      }
    }),
  );
}
