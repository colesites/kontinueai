"use client";

import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Doc } from "@repo/convex/convex/_generated/dataModel";

interface ChatStatusViewProps {
  chat: Doc<"chats"> | null | undefined;
  dbMessages: Doc<"messages">[] | undefined;
}

export function ChatStatusView({ chat, dbMessages }: ChatStatusViewProps) {
  if (chat === undefined || dbMessages === undefined) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (chat === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-zinc-400 mb-4">Chat not found</p>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Import
        </Link>
      </div>
    );
  }

  return null;
}
