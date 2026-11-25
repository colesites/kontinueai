"use node";

// Push for Kode remote control (kodeRemote.ts): a run on your computer needs
// an answer, or a run you started from your phone finished.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { pushToMobile, pushToWeb } from "./lib/pushDelivery";

export const send = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    deviceId: v.string(),
    chatId: v.id("kodeChats"),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(internal.push.getDeliveryProfile, {
      userId: args.userId,
    });
    if (!profile.pushEnabled) return null;
    const url = `/kode/${encodeURIComponent(args.deviceId)}/${args.chatId}`;
    await pushToMobile(ctx, args.userId, {
      title: args.title,
      body: args.body,
      data: { url },
    });
    await pushToWeb(ctx, args.userId, {
      title: args.title,
      body: args.body,
      url,
    });
    return null;
  },
});
