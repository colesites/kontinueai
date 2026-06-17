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

export type KodeConvexChat = {
  _id: string;
  title: string;
  projectId?: string;
  archived?: boolean;
  lastMessageAt?: number;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type KodeConvexProject = {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
  archived: boolean;
  chatCount: number;
  updatedAt: number;
};

export type KodeConvexMessage = {
  _id: string;
  chatId: string;
  role: "system" | "user" | "assistant";
  content: string;
  order: number;
  createdAt: number;
  metadata?: { model?: string };
};

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
      KodeConvexChat[]
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
      KodeConvexProject[]
    >;
    createProject: FunctionReference<
      "mutation",
      "public",
      { name: string; description?: string },
      string
    >;
    assignChatToProject: FunctionReference<
      "mutation",
      "public",
      { chatId: string; projectId: string | null },
      null
    >;
  };
  messages: {
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
      },
      string
    >;
    deleteMessagesAfter: FunctionReference<
      "mutation",
      "public",
      { messageId: string; inclusive?: boolean },
      null
    >;
  };
};

export const api = anyApi as unknown as KodeConvexApi;
