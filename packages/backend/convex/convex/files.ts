import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Create a new file record in Convex after successful Blob upload
 */
export const createFileRecord = mutation({
  args: {
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    blobUrl: v.string(),
    pathname: v.string(),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    fileType: v.union(v.literal("attachment"), v.literal("generated-image")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Get the user's Convex ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate file size (10MB max)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (args.size > MAX_SIZE) {
      throw new Error("File size exceeds 10MB limit");
    }

    // Validate content type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(args.contentType)) {
      throw new Error(
        "Invalid file type. Allowed: PNG, JPEG, WebP, PDF",
      );
    }

    // If chatId is provided, verify ownership
    if (args.chatId) {
      const chat = await ctx.db.get(args.chatId);
      if (!chat || chat.ownerId !== user._id) {
        throw new Error("Chat not found or unauthorized");
      }
    }

    // If messageId is provided, verify it exists and belongs to the chat
    if (args.messageId) {
      const message = await ctx.db.get(args.messageId);
      if (!message) {
        throw new Error("Message not found");
      }
      if (args.chatId && message.chatId !== args.chatId) {
        throw new Error("Message does not belong to specified chat");
      }
    }

    // Create the file record
    const fileId = await ctx.db.insert("files", {
      ownerId: user._id,
      chatId: args.chatId,
      messageId: args.messageId,
      blobUrl: args.blobUrl,
      pathname: args.pathname,
      filename: args.filename,
      contentType: args.contentType,
      size: args.size,
      fileType: args.fileType,
      createdAt: Date.now(),
    });

    return fileId;
  },
});

/**
 * List all files for a specific chat
 */
export const listByChat = query({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    // Return [] (rather than throwing) for missing auth/user/chat so that a
    // reactive subscriber on the chat page doesn't error during the brief window
    // when the chat is deleted while still being viewed (the page then redirects).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      return [];
    }

    // Verify chat ownership
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.ownerId !== user._id) {
      return [];
    }

    // Get all files for this chat
    const files = await ctx.db
      .query("files")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    return files;
  },
});

/**
 * List all files for a specific message
 */
export const listByMessage = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get all files for this message
    const files = await ctx.db
      .query("files")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();

    // Verify ownership through the files themselves
    const unauthorizedFile = files.find((f) => f.ownerId !== user._id);
    if (unauthorizedFile) {
      throw new Error("Unauthorized");
    }

    return files;
  },
});

/**
 * Get a single file by ID
 */
export const getFile = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    if (file.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    return file;
  },
});

/**
 * Delete a file record from Convex
 * Note: The blob itself should be deleted via API route
 */
export const deleteFileRecord = mutation({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    if (file.ownerId !== user._id) {
      throw new Error("Unauthorized - you don't own this file");
    }

    // Delete the record
    await ctx.db.delete(args.fileId);

    return { success: true, pathname: file.pathname };
  },
});

/**
 * List all files for the current user
 */
export const listMyFiles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    return files;
  },
});
