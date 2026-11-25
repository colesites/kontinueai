"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { pushToMobile, pushToWeb } from "./lib/pushDelivery";

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const apiKey = process.env.MULTIVRS_MAIL_KEY;
  const from = process.env.MULTIVRS_FROM ?? "Kontinue AI <reminders@kontinue.ai>";
  if (!apiKey) return; // email channel not configured — skip silently

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">
    <h2 style="margin:0 0 8px">${escapeHtml(subject)}</h2>
    ${body ? `<p style="color:#444;line-height:1.5">${escapeHtml(body)}</p>` : ""}
    <p style="color:#888;font-size:12px;margin-top:24px">Sent by Kontinue AI reminders.</p>
  </div>`;

  const res = await fetch("https://multivrs.space/api/v1/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.error("[reminder] email send failed", res.status, errorText);
  }
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
      await pushToMobile(ctx, args.userId, {
        title: args.title,
        body: args.body ?? "",
        data: args.taskId ? { url: "/tasks" } : { url: "/notifications" },
      });
      await pushToWeb(ctx, args.userId, {
        title: args.title,
        body: args.body ?? "",
        url: args.taskId ? "/tasks" : "/",
      });
    }

    return null;
  },
});
