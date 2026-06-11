"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

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

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Kontinue AI <reminders@kontinue.ai>";
  if (!apiKey) return; // email channel not configured — skip silently

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">
    <h2 style="margin:0 0 8px">${escapeHtml(subject)}</h2>
    ${body ? `<p style="color:#444;line-height:1.5">${escapeHtml(body)}</p>` : ""}
    <p style="color:#888;font-size:12px;margin-top:24px">Sent by Kontinue AI reminders.</p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error("[reminder] email send failed", res.status, await res.text());
  }
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
    console.error("[reminder] expo push send failed", res.status, await res.text());
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
        console.error("[reminder] expo push ticket error", ticket);
      }
    }
  });
  return dead;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Deliver a reminder across push + email. In-app notification is created
// separately by the dispatcher; this action handles the external channels.
export const deliver = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.push.getDeliveryProfile, {
      userId: args.userId,
    });

    // Email
    if (profile.emailEnabled && profile.email) {
      try {
        await sendEmail(profile.email, args.title, args.body ?? "");
      } catch (error) {
        console.error("[reminder] email error", error);
      }
    }

    // Mobile push (Expo) — independent of the web-push VAPID config.
    if (profile.pushEnabled) {
      try {
        const expoTokens = await ctx.runQuery(
          internal.push.getExpoTokensForUser,
          { userId: args.userId },
        );
        const dead = await sendExpoPush(
          expoTokens.map((t) => t.token),
          {
            title: args.title,
            body: args.body ?? "",
            data: args.taskId ? { url: "/tasks" } : { url: "/notifications" },
          },
        );
        for (const token of dead) {
          await ctx.runMutation(internal.push.removeExpoTokenByToken, { token });
        }
      } catch (error) {
        console.error("[reminder] expo push error", error);
      }
    }

    // Push
    if (profile.pushEnabled && ensureVapid()) {
      const subs = await ctx.runQuery(internal.push.getSubscriptionsForUser, {
        userId: args.userId,
      });
      const payload = JSON.stringify({
        title: args.title,
        body: args.body ?? "",
        url: args.taskId ? "/tasks" : "/",
      });
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
              await ctx.runMutation(
                internal.push.removeSubscriptionByEndpoint,
                { endpoint: sub.endpoint },
              );
            } else {
              console.error("[reminder] push error", statusCode, error);
            }
          }
        }),
      );
    }

    return null;
  },
});
