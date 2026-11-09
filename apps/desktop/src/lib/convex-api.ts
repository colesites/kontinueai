import { anyApi, type FunctionReference } from "convex/server";

type PaginationOpts = {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  id?: number;
  maximumRowsRead?: number;
  maximumBytesRead?: number;
};

type Paginated<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};

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
  importSource?: {
    provider: string;
    sessionId: string;
    projectPath?: string;
    lastActivity?: number;
    importedAt: number;
    syncedMessageCount?: number;
    syncedAt?: number;
  };
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

// Kode usage in micro-dollars of model cost (see convex/kodeUsage.ts).
export type KodeUsageWindow = {
  used: number;
  limit: number;
  resetAt: number | null;
};
export type KodeUsage = {
  plan: "free" | "starter" | "plus" | "pro" | "max";
  session: KodeUsageWindow;
  weekly: { used: number; limit: number; resetAt: number };
  relaxed: { used: number; limit: number };
  creditsMicros: number;
  credits: {
    balance: number;
    autoUse: boolean;
    monthlyLimit: number;
    monthSpent: number;
    monthResetAt: number;
  };
} | null;

export type KodeUsageHistory = {
  weekStartMs: number;
  hours: { hourStartMs: number; micros: number; requests: number }[];
  models: { modelId: string; micros: number; requests: number }[];
} | null;

type KodeConvexApi = {
  users: {
    getCurrentUser: FunctionReference<"query", "public", Record<string, never>, CurrentUser>;
    getOrCreateUser: FunctionReference<"mutation", "public", GetOrCreateUserArgs, string>;
  };
  chats: {
    getUserChats: FunctionReference<"query", "public", Record<string, never>, HomeConvexChat[]>;
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
    toggleChatPin: FunctionReference<"mutation", "public", { chatId: string; pinned: boolean }, { pinned: boolean }>;
    setChatArchived: FunctionReference<"mutation", "public", { chatId: string; archived: boolean }, { archived: boolean }>;
    deleteChat: FunctionReference<"mutation", "public", { chatId: string }, unknown>;
    updateChatTitle: FunctionReference<"mutation", "public", { chatId: string; title: string }, unknown>;
  };
  projects: {
    listProjects: FunctionReference<"query", "public", { includeArchived?: boolean }, HomeConvexProject[]>;
    createProject: FunctionReference<"mutation", "public", { name: string; description?: string; color?: string; icon?: string }, string>;
    updateProject: FunctionReference<"mutation", "public", { projectId: string; name?: string; description?: string }, unknown>;
  };
  connectors: {
    listConnectors: FunctionReference<
      "query",
      "public",
      Record<string, never>,
      {
        _id: string;
        provider: string;
        connected: boolean;
        accountLabel?: string;
        tokenExpiresAt?: number;
      }[]
    >;
    /** Deletes the stored tokens for one provider. */
    disconnect: FunctionReference<"mutation", "public", { provider: string }, unknown>;
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
    deleteMessagesAfter: FunctionReference<"mutation", "public", { messageId: string; inclusive?: boolean }, null>;
  };
  kode: {
    getUserChats: FunctionReference<"query", "public", Record<string, never>, KodeConvexChat[]>;
    createChat: FunctionReference<"mutation", "public", { title: string }, string>;
    importSession: FunctionReference<
      "mutation",
      "public",
      {
        title: string;
        provider: string;
        sessionId: string;
        projectPath?: string;
        lastActivity?: number;
        model?: string;
        messages: {
          role: "user" | "assistant" | "system";
          content: string;
          timestamp?: number;
        }[];
      },
      string
    >;
    appendImportedMessages: FunctionReference<
      "mutation",
      "public",
      {
        chatId: string;
        expectedMessageCount: number;
        model?: string;
        messages: {
          role: "user" | "assistant" | "system";
          content: string;
          timestamp?: number;
        }[];
      },
      number
    >;
    saveImportContext: FunctionReference<
      "mutation",
      "public",
      { chatId: string; contextPrompt: string; summary?: string; projectName?: string },
      null
    >;
    getImportContext: FunctionReference<
      "query",
      "public",
      { chatId: string },
      { contextPrompt: string; summary: string | null; projectName: string | null; updatedAt: number } | null
    >;
    getMessages: FunctionReference<"query", "public", { chatId: string }, KodeConvexMessage[]>;
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
    deleteMessagesAfter: FunctionReference<"mutation", "public", { messageId: string; inclusive?: boolean }, null>;
    toggleChatPin: FunctionReference<"mutation", "public", { chatId: string; pinned: boolean }, { pinned: boolean }>;
    setChatArchived: FunctionReference<"mutation", "public", { chatId: string; archived: boolean }, { archived: boolean }>;
    updateChatTitle: FunctionReference<"mutation", "public", { chatId: string; title: string }, null>;
    deleteChat: FunctionReference<"mutation", "public", { chatId: string }, unknown>;
  };
  kodeUsage: {
    getUsage: FunctionReference<"query", "public", Record<string, never>, KodeUsage>;
    getUsageHistory: FunctionReference<"query", "public", Record<string, never>, KodeUsageHistory>;
    setCreditSettings: FunctionReference<"mutation", "public", { autoUse?: boolean; monthlyLimitMicros?: number }, null>;
  };
  canvas: {
    getCredits: FunctionReference<"query", "public", Record<string, never>, CanvasCredits>;
    listPublished: FunctionReference<"query", "public", { paginationOpts: PaginationOpts; sortBy?: "likes" | "recent" }, Paginated<CanvasCreation>>;
    listMyCreations: FunctionReference<"query", "public", { paginationOpts: PaginationOpts }, Paginated<CanvasCreation>>;
    getMyLikes: FunctionReference<"query", "public", Record<string, never>, string[]>;
    toggleLike: FunctionReference<"mutation", "public", { creationId: string }, { liked: boolean }>;
    publishCreation: FunctionReference<"mutation", "public", { creationId: string }, { isPublished: boolean }>;
    createCreation: FunctionReference<
      "mutation",
      "public",
      {
        mediaType: "image" | "video";
        mediaUrl: string;
        pathname: string;
        prompt: string;
        modelId: string;
        aspectRatio: string;
        duration?: number;
        quality?: string;
        audio?: boolean;
        referenceImageUrl?: string;
        resolution?: string;
      },
      string
    >;
  };
};

export type CanvasCreation = {
  _id: string;
  ownerId?: string;
  ownerName?: string;
  ownerImageUrl?: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  pathname?: string;
  prompt: string;
  modelId: string;
  aspectRatio: string;
  duration?: number;
  quality?: string;
  audio?: boolean;
  resolution?: string;
  isPublished: boolean;
  likeCount: number;
  createdAt: number;
};

export type CanvasCredits = {
  total: number;
  used: number;
  remaining: number;
  monthKey: string;
  isPro: boolean;
  monthly: { total: number; used: number; remaining: number };
  bonus: { total: number; used: number; remaining: number };
  available: number;
} | null;

export type KodeWebhook = {
  id: string;
  name: string;
  token: string;
  projectPath: string | null;
  projectName: string | null;
  instructions: string | null;
  enabled: boolean;
  lastEventAt: number | null;
};

export type KodeWebhookEvent = {
  id: string;
  webhookName: string;
  projectPath: string | null;
  projectName: string | null;
  instructions: string | null;
  source: string;
  event: string;
  summary: string;
  payload: string;
  createdAt: number;
};

export type KodeWebhooksApi = {
  kodeWebhooks: {
    createWebhook: FunctionReference<"mutation", "public", { name: string; projectPath?: string; projectName?: string; instructions?: string }, { id: string; token: string }>;
    listWebhooks: FunctionReference<"query", "public", Record<string, never>, KodeWebhook[]>;
    updateWebhook: FunctionReference<"mutation", "public", { id: string; enabled?: boolean; instructions?: string; rotateToken?: boolean }, null>;
    deleteWebhook: FunctionReference<"mutation", "public", { id: string }, null>;
    pendingWebhookEvents: FunctionReference<"query", "public", Record<string, never>, KodeWebhookEvent[]>;
    claimWebhookEvent: FunctionReference<"mutation", "public", { eventId: string; deviceId: string }, boolean>;
  };
};

export type ProjectBundle = {
  name: string;
  remoteUrl: string | null;
  branch: string | null;
  headSha: string | null;
  headPushed: boolean;
  patch: string;
  changedFiles: string[];
};

export type KodeProjectMovesApi = {
  kodeProjectMoves: {
    sendProjectMove: FunctionReference<"mutation", "public", { name: string; remoteUrl?: string; branch?: string; headSha?: string; headPushed: boolean; patch: string; changedFiles: string[]; chatIds: string[]; fromDevice: string }, string>;
    listProjectMoves: FunctionReference<"query", "public", Record<string, never>, { id: string; name: string; remoteUrl: string | null; branch: string | null; headPushed: boolean; changedFiles: number; chats: number; fromDevice: string; createdAt: number }[]>;
    claimProjectMove: FunctionReference<"mutation", "public", { id: string; deviceId: string }, (ProjectBundle & { chatIds: string[] }) | null>;
    releaseProjectMove: FunctionReference<"mutation", "public", { id: string; cancel?: boolean }, null>;
  };
};

export const api = anyApi as unknown as KodeConvexApi;
export const projectMovesApi = anyApi as unknown as KodeProjectMovesApi;
export const webhooksApi = anyApi as unknown as KodeWebhooksApi;
