import { open } from "@tauri-apps/plugin-dialog";
import type { LanguageModelUsage } from "ai";
import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api } from "@/lib/convex-api";

// Projects are LOCAL imported folders (stored on this machine), and the
// chat → folder grouping is kept locally too. Chats themselves live in Convex.
const FOLDERS_KEY = "kontinue:kode-folders:v1";
const CHAT_FOLDER_KEY = "kontinue:kode-chat-folder:v1";

type KodeFolder = { id: string; name: string; path: string };

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// View-model message shape used by the chat view. Reasoning / usage / status are
// ephemeral (not persisted in Convex) and only live for the current session.
export type KodeWorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId: string;
  createdAt?: number;
  reasoning?: string;
  status?: "thinking" | "complete" | "error";
  usage?: LanguageModelUsage;
};

// A project is a local imported folder. `path` is the on-disk directory.
export type KodeProject = {
  id: string;
  name: string;
  hue: string;
  path: string;
};

export type KodeChat = {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: number;
  pinnedAt: number | null;
  archived: boolean;
};

type KodeWorkspaceContextValue = {
  projects: KodeProject[];
  chats: KodeChat[];
  chatsLoading: boolean;
  activeChatId: string | null;
  draftProjectId: string | null;
  importFolder: () => Promise<void>;
  removeFolder: (folderId: string) => void;
  newChat: (projectId?: string | null) => void;
  selectChat: (chatId: string) => void;
  createChatRecord: (input: {
    title: string;
    projectId?: string | null;
  }) => Promise<string>;
  addMessageRecord: (input: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    tokens?: number;
    sources?: { title: string; url: string }[];
    todos?: { title: string; description?: string; status: string }[];
  }) => Promise<void>;
  togglePinChat: (chatId: string, pinned: boolean) => Promise<void>;
  archiveChat: (chatId: string, archived: boolean) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  rewindAfter: (messageId: string) => Promise<void>;
};

const KodeWorkspaceContext = createContext<KodeWorkspaceContextValue | null>(
  null,
);

export function KodeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [folders, setFolders] = useState<KodeFolder[]>(() =>
    loadJSON<KodeFolder[]>(FOLDERS_KEY, []),
  );
  // chatId → local folder id
  const [chatFolder, setChatFolder] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(CHAT_FOLDER_KEY, {}),
  );

  const convexChats = useQuery(api.kode.getUserChats, {});

  const createChat = useMutation(api.kode.createChat);
  const addMessage = useMutation(api.kode.addMessage);
  const toggleChatPin = useMutation(api.kode.toggleChatPin);
  const setChatArchived = useMutation(api.kode.setChatArchived);
  const deleteChatMutation = useMutation(api.kode.deleteChat);
  const deleteMessagesAfter = useMutation(api.kode.deleteMessagesAfter);

  useEffect(() => {
    window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);
  useEffect(() => {
    window.localStorage.setItem(CHAT_FOLDER_KEY, JSON.stringify(chatFolder));
  }, [chatFolder]);

  const projects = useMemo<KodeProject[]>(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        hue: "var(--brand)",
        path: folder.path,
      })),
    [folders],
  );

  const chats = useMemo<KodeChat[]>(
    () =>
      (convexChats ?? [])
        .filter((chat) => !chat.archived)
        .map((chat) => ({
          id: chat._id,
          title: chat.title,
          projectId: chatFolder[chat._id] ?? null,
          updatedAt: chat.lastMessageAt ?? chat.updatedAt,
          pinnedAt:
            typeof chat.pinnedAt === "number" && chat.pinnedAt > 0
              ? chat.pinnedAt
              : null,
          archived: Boolean(chat.archived),
        })),
    [convexChats, chatFolder],
  );

  const importFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Import folder",
    });

    if (typeof selected !== "string") return;

    const path = selected;
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;

    setFolders((current) => {
      const existing = current.find((folder) => folder.path === path);
      if (existing) {
        setDraftProjectId(existing.id);
        return current;
      }
      const folder: KodeFolder = { id: `folder-${Date.now()}`, name, path };
      setDraftProjectId(folder.id);
      return [...current, folder];
    });
    setActiveChatId(null);
  }, []);

  const removeFolder = useCallback((folderId: string) => {
    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setChatFolder((current) => {
      const next = { ...current };
      for (const [chatId, fId] of Object.entries(next)) {
        if (fId === folderId) delete next[chatId];
      }
      return next;
    });
    setDraftProjectId((current) => (current === folderId ? null : current));
  }, []);

  const newChat = useCallback((projectId: string | null = null) => {
    setActiveChatId(null);
    setDraftProjectId(projectId);
  }, []);

  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setDraftProjectId(null);
  }, []);

  const createChatRecord = useCallback(
    async ({
      title,
      projectId,
    }: {
      title: string;
      projectId?: string | null;
    }) => {
      const chatId = await createChat({
        title: toChatTitle(title),
      });

      // Group under a local folder client-side (folders never touch Convex).
      if (projectId) {
        setChatFolder((current) => ({ ...current, [chatId]: projectId }));
      }

      // The caller decides when to switch the active chat (selectChat), so the
      // optimistic overlay can be retagged in the same render and never flashes.
      return chatId;
    },
    [createChat],
  );

  const addMessageRecord = useCallback(
    async (input: {
      chatId: string;
      role: "user" | "assistant";
      content: string;
      model?: string;
      tokens?: number;
      sources?: { title: string; url: string }[];
      todos?: { title: string; description?: string; status: string }[];
    }) => {
      await addMessage(input);
    },
    [addMessage],
  );

  const togglePinChat = useCallback(
    async (chatId: string, pinned: boolean) => {
      await toggleChatPin({ chatId, pinned });
    },
    [toggleChatPin],
  );

  const archiveChat = useCallback(
    async (chatId: string, archived: boolean) => {
      await setChatArchived({ chatId, archived });
    },
    [setChatArchived],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatMutation({ chatId });
      setActiveChatId((current) => (current === chatId ? null : current));
      setChatFolder((current) => {
        if (!(chatId in current)) return current;
        const next = { ...current };
        delete next[chatId];
        return next;
      });
    },
    [deleteChatMutation],
  );

  // Rewind: drop the given message and everything after it (used to redo a turn).
  const rewindAfter = useCallback(
    async (messageId: string) => {
      await deleteMessagesAfter({ messageId, inclusive: true });
    },
    [deleteMessagesAfter],
  );

  const value = useMemo<KodeWorkspaceContextValue>(
    () => ({
      projects,
      chats,
      chatsLoading: convexChats === undefined,
      activeChatId,
      draftProjectId,
      importFolder,
      removeFolder,
      newChat,
      selectChat,
      createChatRecord,
      addMessageRecord,
      togglePinChat,
      archiveChat,
      deleteChat,
      rewindAfter,
    }),
    [
      activeChatId,
      addMessageRecord,
      archiveChat,
      chats,
      convexChats,
      createChatRecord,
      deleteChat,
      draftProjectId,
      importFolder,
      newChat,
      projects,
      removeFolder,
      rewindAfter,
      selectChat,
      togglePinChat,
    ],
  );

  return (
    <KodeWorkspaceContext.Provider value={value}>
      {children}
    </KodeWorkspaceContext.Provider>
  );
}

export function useKodeWorkspace() {
  const context = useContext(KodeWorkspaceContext);

  if (!context) {
    throw new Error("useKodeWorkspace must be used within KodeWorkspaceProvider");
  }

  return context;
}

function toChatTitle(input: string) {
  const title = input.replace(/\s+/g, " ").trim();

  if (!title) return "New chat";
  if (title.length <= 60) return title;
  return `${title.slice(0, 57).trim()}...`;
}
