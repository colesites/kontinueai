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
  email: string;
  name?: string;
  imageUrl?: string;
  subscriptionStatus?: string;
  plan?: string;
};

export type HomeConvexChat = {
  _id: string;
  title: string;
  projectId?: string;
  archived?: boolean;
  lastMessageAt?: number;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type HomeConvexProject = {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
  status: "active" | "on_hold" | "completed";
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

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
  chats: {
    getUserChats: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      HomeConvexChat[]
    >;
    createChat: FunctionReference<
      "mutation",
      "public",
      {
        title: string;
        provider: string;
        sourceUrl?: string;
        importMethod: "automatic" | "manual";
        messages: { role: "system" | "user" | "assistant"; content: string }[];
      },
      string
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
    deleteChat: FunctionReference<
      "mutation",
      "public",
      { chatId: string },
      unknown
    >;
  };
  projects: {
    listProjects: FunctionReference<
      "query",
      "public",
      { includeArchived?: boolean },
      HomeConvexProject[]
    >;
    createProject: FunctionReference<
      "mutation",
      "public",
      { name: string; description?: string; color?: string; icon?: string },
      string
    >;
    updateProject: FunctionReference<
      "mutation",
      "public",
      { projectId: string; name?: string; description?: string },
      unknown
    >;
  };
  connectors: {
    listConnectors: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      { _id: string; provider: string; connected: boolean; accountLabel?: string }[]
    >;
  };
  messages: {
    addMessage: FunctionReference<
      "mutation",
      "public",
      {
        chatId: string;
        role: "user" | "assistant";
        content: string;
        model?: string;
      } & KodeMessageMetadataArgs,
      string
    >;
    getMessages: FunctionReference<
      "query",
      "public",
      { chatId: string },
      {
        _id: string;
        chatId: string;
        role: "user" | "assistant" | "system";
        content: string;
        model?: string;
        createdAt?: number;
      }[]
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
