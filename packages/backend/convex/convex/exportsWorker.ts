"use node";

import { v } from "convex/values";
import JSZip from "jszip";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  createPresignedDownloadUrl,
  deleteObject,
  exportKey,
  putObjectBytes,
} from "./r2";

type CollectedData = {
  user: {
    _id: string;
    email: string;
    name: string | null;
    plan: string | null;
    createdAt: number;
  };
  chats: Array<{ chat: Doc<"chats">; messages: Doc<"messages">[] }>;
  memories: Doc<"memories">[];
  summaries: Doc<"memorySummaries">[];
};

function safeFilename(input: string): string {
  return (
    input
      .replace(/[^a-z0-9-_ ]+/gi, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "untitled"
  );
}

function isoDate(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function buildJsonPayload(data: CollectedData) {
  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    user: data.user,
    conversations: data.chats.map(({ chat, messages }) => ({
      id: chat._id,
      title: chat.title,
      summary: chat.summary ?? null,
      source: chat.source,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      archived: chat.archived ?? false,
      pinnedAt: chat.pinnedAt ?? null,
      messages: messages.map((message) => ({
        id: message._id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        order: message.order,
        tokenCount: message.tokenCount ?? null,
        metadata: message.metadata ?? null,
      })),
    })),
    memories: data.memories.map((memory) => ({
      id: memory._id,
      type: memory.type,
      content: memory.content,
      keywords: memory.keywords,
      importanceScore: memory.importanceScore,
      pinned: memory.pinned,
      manuallySaved: memory.manuallySaved,
      archived: memory.archived,
      sourceChatId: memory.sourceChatId ?? null,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })),
    summaries: data.summaries.map((summary) => ({
      id: summary._id,
      periodType: summary.periodType,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      summary: summary.summary,
      createdAt: summary.createdAt,
      sourceChatId: summary.sourceChatId ?? null,
    })),
  };
}

function buildMarkdownIndex(data: CollectedData): string {
  const lines: string[] = [];
  lines.push(`# Kontinue AI Export`);
  lines.push("");
  lines.push(`- User: ${data.user.email}`);
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Conversations: ${data.chats.length}`);
  lines.push(`- Memories: ${data.memories.length}`);
  lines.push(`- Summaries: ${data.summaries.length}`);
  lines.push("");
  lines.push(`## Conversations`);
  for (const { chat } of data.chats) {
    lines.push(`- ${chat.title} _(${isoDate(chat.createdAt)})_`);
  }
  return lines.join("\n");
}

function buildConversationMarkdown(
  chat: Doc<"chats">,
  messages: Doc<"messages">[],
): string {
  const lines: string[] = [];
  lines.push(`# ${chat.title}`);
  lines.push("");
  lines.push(`_Created ${isoDate(chat.createdAt)}_`);
  if (chat.summary) {
    lines.push("");
    lines.push(`> ${chat.summary}`);
  }
  lines.push("");
  for (const message of messages) {
    const heading =
      message.role === "user"
        ? "### You"
        : message.role === "assistant"
          ? "### Assistant"
          : "### System";
    lines.push(heading);
    lines.push("");
    lines.push(message.content.trim());
    lines.push("");
  }
  return lines.join("\n");
}

function buildMemoriesMarkdown(data: CollectedData): string {
  const lines: string[] = [];
  lines.push(`# Memories`);
  lines.push("");
  for (const memory of data.memories) {
    lines.push(
      `- **[${memory.type}]** ${memory.content}${memory.pinned ? " _(pinned)_" : ""}`,
    );
  }
  return lines.join("\n");
}

function buildFlatMarkdown(data: CollectedData): string {
  const sections: string[] = [];
  sections.push(buildMarkdownIndex(data));
  sections.push("\n---\n");
  for (const { chat, messages } of data.chats) {
    sections.push(buildConversationMarkdown(chat, messages));
    sections.push("\n---\n");
  }
  sections.push(buildMemoriesMarkdown(data));
  return sections.join("\n");
}

export const generateExportFile = internalAction({
  args: { exportId: v.id("dataExports") },
  handler: async (ctx, args) => {
    const meta = await ctx.runQuery(internal.exports.getExportMeta, {
      exportId: args.exportId,
    });
    if (!meta) return;

    try {
      const data: CollectedData = await ctx.runQuery(
        internal.exports.collectExportData,
        { userId: meta.ownerId as Id<"users"> },
      );

      let body: Uint8Array;
      let contentType: string;

      if (meta.format === "json") {
        const json = JSON.stringify(buildJsonPayload(data), null, 2);
        body = new TextEncoder().encode(json);
        contentType = "application/json";
      } else if (meta.format === "markdown") {
        const md = buildFlatMarkdown(data);
        body = new TextEncoder().encode(md);
        contentType = "text/markdown";
      } else {
        const zip = new JSZip();
        zip.file("export.json", JSON.stringify(buildJsonPayload(data), null, 2));
        zip.file("README.md", buildMarkdownIndex(data));
        zip.file("memories.md", buildMemoriesMarkdown(data));
        const conversations = zip.folder("conversations");
        const seen = new Map<string, number>();
        for (const { chat, messages } of data.chats) {
          const base = safeFilename(chat.title);
          const count = seen.get(base) ?? 0;
          seen.set(base, count + 1);
          const filename = count === 0 ? `${base}.md` : `${base}-${count}.md`;
          conversations?.file(filename, buildConversationMarkdown(chat, messages));
        }
        body = await zip.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        contentType = "application/zip";
      }

      const objectKey = exportKey(meta.ownerId, args.exportId, meta.format);
      await putObjectBytes({ key: objectKey, body, contentType });

      await ctx.runMutation(internal.exports.markExportReady, {
        exportId: args.exportId,
        objectKey,
        byteSize: body.byteLength,
        conversationCount: data.chats.length,
        memoryCount: data.memories.length,
        summaryCount: data.summaries.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      console.error("export generation failed", error);
      await ctx.runMutation(internal.exports.markExportFailed, {
        exportId: args.exportId,
        errorMessage: message,
      });
    }
  },
});

export const deleteExportObject = internalAction({
  args: { objectKey: v.string() },
  handler: async (_ctx, args) => {
    await deleteObject(args.objectKey);
  },
});

// Public action so the browser can request a short-lived signed GET URL.
// We verify ownership here (Node runtime can't run inside a query).
export const getDownloadUrl = action({
  args: { exportId: v.id("dataExports") },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) {
      throw new Error("Not authenticated");
    }
    const meta = await ctx.runQuery(internal.exports.getExportMeta, {
      exportId: args.exportId,
    });
    if (!meta || meta.ownerId !== user._id) {
      throw new Error("Export not found");
    }
    if (meta.status !== "ready" || !meta.objectKey) {
      throw new Error("Export is not ready yet");
    }
    const filename =
      meta.format === "json"
        ? "kontinue-export.json"
        : meta.format === "markdown"
          ? "kontinue-export.md"
          : "kontinue-export.zip";
    const url = await createPresignedDownloadUrl({ key: meta.objectKey, filename });
    return { url };
  },
});
