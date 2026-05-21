"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { ChatMessage } from "../../../features/chat/components/ChatMessage";

export default function SharePage() {
  const params = useParams();
  const chatId = params.chatId as Id<"chats">;

  // Query Convex for shared conversation (no auth required)
  const conversation = useQuery(api.chats.getSharedConversation, { chatId });

  // Loading state
  if (conversation === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state - conversation not found (404)
  if (conversation === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Conversation Not Found
        </h1>
        <p className="text-muted-foreground">
          This conversation doesn&apos;t exist or has been deleted.
        </p>
      </div>
    );
  }

  // Render conversation in read-only format
  const messages = conversation.messages || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 border-b border-border pb-4">
          <h1 className="text-2xl font-semibold text-foreground">
            {conversation.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared conversation
          </p>
        </div>

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage
              key={message._id}
              role={message.role as "user" | "assistant"}
              content={message.content}
              imageParts={[]}
              isImported={false}
              isStreaming={false}
            />
          ))}
        </div>

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">
              This conversation has no messages yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
