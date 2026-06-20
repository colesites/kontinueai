import { anyApi, type FunctionReference } from "convex/server";

type CurrentUser = {
  _id: string;
  clerkUserId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  subscriptionStatus?: string;
  plan?: string;
} | null;

type GetOrCreateUserArgs = {
  clerkUserId: string;
  email: string;
  name?: string;
  imageUrl?: string;
  subscriptionStatus?: string;
  plan?: string;
};

// The Kode IDE talks to its OWN Convex tables (kodeChats / kodeMessages) via the
// `kode` module, so coding chats never leak into the web app's chat list/search
// or its memory/embedding/title pipelines.
export type KodeConvexChat = {
  _id: string;
  title: string;
  archived?: boolean;
  lastMessageAt?: number;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type KodeConvexMessage = {
  _id: string;
  chatId: string;
  role: "system" | "user" | "assistant";
  content: string;
  order: number;
  createdAt: number;
  metadata?: {
    model?: string;
    sources?: { title: string; url: string }[];
    todos?: { title: string; description?: string; status: string }[];
  };
};

type KodeMessageMetadataArgs = {
  sources?: { title: string; url: string }[];
  todos?: { title: string; description?: string; status: string }[];
};

// `used` / `limit` are in TOKENS (input+output summed across the agent turn).
export type KodeUsageWindow = {
  used: number;
  limit: number;
  resetAt: number;
};

export type KodeUsage = {
  plan: "free" | "starter" | "pro";
  daily: KodeUsageWindow;
  weekly: KodeUsageWindow;
} | null;

type KodeConvexApi = {
  users: {
    getCurrentUser: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      CurrentUser
    >;
    getOrCreateUser: FunctionReference<
      "mutation",
      "public",
      GetOrCreateUserArgs,
      string
    >;
  };
  kode: {
    getUserChats: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      KodeConvexChat[]
    >;
    createChat: FunctionReference<
      "mutation",
      "public",
      { title: string },
      string
    >;
    getMessages: FunctionReference<
      "query",
      "public",
      { chatId: string },
      KodeConvexMessage[]
    >;
    addMessage: FunctionReference<
      "mutation",
      "public",
      {
        chatId: string;
        role: "user" | "assistant";
        content: string;
        model?: string;
        tokens?: number;
      } & KodeMessageMetadataArgs,
      string
    >;
    deleteMessagesAfter: FunctionReference<
      "mutation",
      "public",
      { messageId: string; inclusive?: boolean },
      null
    >;
    toggleChatPin: FunctionReference<
      "mutation",
      "public",
      { chatId: string; pinned: boolean },
      { pinned: boolean }
    >;
    setChatArchived: FunctionReference<
      "mutation",
      "public",
      { chatId: string; archived: boolean },
      { archived: boolean }
    >;
    updateChatTitle: FunctionReference<
      "mutation",
      "public",
      { chatId: string; title: string },
      null
    >;
    deleteChat: FunctionReference<
      "mutation",
      "public",
      { chatId: string },
      unknown
    >;
    getUsage: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      KodeUsage
    >;
  };
};

export const api = anyApi as unknown as KodeConvexApi;
