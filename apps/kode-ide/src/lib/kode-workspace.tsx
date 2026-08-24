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

import {
  api,
  type HomeConvexChat,
  type HomeConvexProject,
  type KodeConvexChat,
} from "@/lib/convex-api";

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

// A project is a local imported folder (or Convex project in Home tab).
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

export type KodeTab = "home" | "canvas" | "kode";

type KodeWorkspaceContextValue = {
  activeTab: KodeTab;
  setActiveTab: (tab: KodeTab) => void;
  projects: KodeProject[];
  chats: KodeChat[];
  chatsLoading: boolean;
  activeChatId: string | null;
  draftProjectId: string | null;
  importFolder: () => Promise<void>;
  removeFolder: (folderId: string) => void;
  newChat: (projectId?: string | null) => void;
  selectChat: (chatId: string) => void;
  createProjectRecord: (input: {
    name: string;
    description?: string;
  }) => Promise<string>;
  renameProjectRecord: (
    projectId: string,
    name: string,
    description?: string,
  ) => Promise<void>;
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
  const [activeTab, setActiveTab] = useState<KodeTab>("home");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [folders, setFolders] = useState<KodeFolder[]>(() =>
    loadJSON<KodeFolder[]>(FOLDERS_KEY, []),
  );
  // chatId → local folder id
  const [chatFolder, setChatFolder] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(CHAT_FOLDER_KEY, {}),
  );

  // Queries: Home tab uses `chats` table + `projects` table; Kode tab uses `kodeChats` table + local folders
  const convexHomeChats = useQuery(api.chats.getUserChats, {});
  const convexKodeChats = useQuery(api.kode.getUserChats, {});
  const convexHomeProjects = useQuery(api.projects.listProjects, {});

  // Mutations for Home tab (chats / messages / projects)
  const createHomeChat = useMutation(api.chats.createChat);
  const createHomeProject = useMutation(api.projects.createProject);
  const updateHomeProject = useMutation(api.projects.updateProject);
  const addHomeMessage = useMutation(api.messages.addMessage);
  const toggleHomeChatPin = useMutation(api.chats.toggleChatPin);
  const setHomeChatArchived = useMutation(api.chats.setChatArchived);
  const deleteHomeChatMutation = useMutation(api.chats.deleteChat);

  // Mutations for Kode tab (kodeChats / kodeMessages)
  const createKodeChat = useMutation(api.kode.createChat);
  const addKodeMessage = useMutation(api.kode.addMessage);
  const toggleKodeChatPin = useMutation(api.kode.toggleChatPin);
  const setKodeChatArchived = useMutation(api.kode.setChatArchived);
  const deleteKodeChatMutation = useMutation(api.kode.deleteChat);
  const deleteKodeMessagesAfter = useMutation(api.kode.deleteMessagesAfter);

  useEffect(() => {
    window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);
  useEffect(() => {
    window.localStorage.setItem(CHAT_FOLDER_KEY, JSON.stringify(chatFolder));
  }, [chatFolder]);

  // Projects list: Home tab shows Convex projects, Kode tab shows local imported folders
  const projects = useMemo<KodeProject[]>(() => {
    if (activeTab === "home") {
      return (convexHomeProjects ?? []).map((project: HomeConvexProject) => ({
        id: project._id,
        name: project.name,
        hue: project.color ?? "var(--brand)",
        path: "",
      }));
    }
    return folders.map((folder: KodeFolder) => ({
      id: folder.id,
      name: folder.name,
      hue: "var(--brand)",
      path: folder.path,
    }));
  }, [activeTab, convexHomeProjects, folders]);

  // Chats list: Home tab shows `chats` table, Kode/Canvas tab shows `kodeChats` table
  const chats = useMemo<KodeChat[]>(() => {
    if (activeTab === "home") {
      return (convexHomeChats ?? [])
        .filter((chat: HomeConvexChat) => !chat.archived)
        .map((chat: HomeConvexChat) => ({
          id: chat._id,
          title: chat.title,
          projectId: chat.projectId ?? null,
          updatedAt: chat.lastMessageAt ?? chat.updatedAt,
          pinnedAt:
            typeof chat.pinnedAt === "number" && chat.pinnedAt > 0
              ? chat.pinnedAt
              : null,
          archived: Boolean(chat.archived),
        }));
    }
    return (convexKodeChats ?? [])
      .filter((chat: KodeConvexChat) => !chat.archived)
      .map((chat: KodeConvexChat) => ({
        id: chat._id,
        title: chat.title,
        projectId: chatFolder[chat._id] ?? null,
        updatedAt: chat.lastMessageAt ?? chat.updatedAt,
        pinnedAt:
          typeof chat.pinnedAt === "number" && chat.pinnedAt > 0
            ? chat.pinnedAt
            : null,
        archived: Boolean(chat.archived),
      }));
  }, [activeTab, convexHomeChats, convexKodeChats, chatFolder]);

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

  const createProjectRecord = useCallback(
    async ({ name, description }: { name: string; description?: string }) => {
      const id = await createHomeProject({
        name,
        description: description?.trim() || undefined,
      });
      setDraftProjectId(id);
      return id;
    },
    [createHomeProject],
  );

  const renameProjectRecord = useCallback(
    async (projectId: string, name: string, description?: string) => {
      if (activeTab === "home") {
        await updateHomeProject({
          projectId,
          name: name.trim(),
          description: description?.trim() || undefined,
        });
      } else {
        setFolders((current) =>
          current.map((f) => (f.id === projectId ? { ...f, name: name.trim() } : f)),
        );
      }
    },
    [activeTab, updateHomeProject],
  );

  const createChatRecord = useCallback(
    async ({
      title,
      projectId,
    }: {
      title: string;
      projectId?: string | null;
    }) => {
      const chatTitle = toChatTitle(title);
      let chatId: string;

      if (activeTab === "home") {
        chatId = await createHomeChat({
          title: chatTitle,
          provider: "manual",
          importMethod: "manual",
          messages: [],
        });
      } else {
        chatId = await createKodeChat({
          title: chatTitle,
        });
        if (projectId) {
          setChatFolder((current) => ({ ...current, [chatId]: projectId }));
        }
      }

      return chatId;
    },
    [activeTab, createHomeChat, createKodeChat],
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
      if (activeTab === "home") {
        await addHomeMessage({
          chatId: input.chatId as any,
          role: input.role,
          content: input.content,
          model: input.model,
          sources: input.sources,
          todos: input.todos,
        });
      } else {
        await addKodeMessage({
          chatId: input.chatId as any,
          role: input.role,
          content: input.content,
          model: input.model,
          tokens: input.tokens,
          sources: input.sources,
          todos: input.todos,
        });
      }
    },
    [activeTab, addHomeMessage, addKodeMessage],
  );

  const togglePinChat = useCallback(
    async (chatId: string, pinned: boolean) => {
      if (activeTab === "home") {
        await toggleHomeChatPin({ chatId: chatId as any, pinned });
      } else {
        await toggleKodeChatPin({ chatId: chatId as any, pinned });
      }
    },
    [activeTab, toggleHomeChatPin, toggleKodeChatPin],
  );

  const archiveChat = useCallback(
    async (chatId: string, archived: boolean) => {
      if (activeTab === "home") {
        await setHomeChatArchived({ chatId: chatId as any, archived });
      } else {
        await setKodeChatArchived({ chatId: chatId as any, archived });
      }
    },
    [activeTab, setHomeChatArchived, setKodeChatArchived],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (activeTab === "home") {
        await deleteHomeChatMutation({ chatId: chatId as any });
      } else {
        await deleteKodeChatMutation({ chatId: chatId as any });
      }
      setActiveChatId((current) => (current === chatId ? null : current));
      setChatFolder((current) => {
        if (!(chatId in current)) return current;
        const next = { ...current };
        delete next[chatId];
        return next;
      });
    },
    [activeTab, deleteHomeChatMutation, deleteKodeChatMutation],
  );

  const rewindAfter = useCallback(
    async (messageId: string) => {
      await deleteKodeMessagesAfter({ messageId: messageId as any, inclusive: true });
    },
    [deleteKodeMessagesAfter],
  );

  const value = useMemo<KodeWorkspaceContextValue>(
    () => ({
      activeTab,
      setActiveTab,
      projects,
      chats,
      chatsLoading:
        activeTab === "home"
          ? convexHomeChats === undefined
          : convexKodeChats === undefined,
      activeChatId,
      draftProjectId,
      importFolder,
      removeFolder,
      newChat,
      selectChat,
      createProjectRecord,
      renameProjectRecord,
      createChatRecord,
      addMessageRecord,
      togglePinChat,
      archiveChat,
      deleteChat,
      rewindAfter,
    }),
    [
      activeTab,
      activeChatId,
      addMessageRecord,
      archiveChat,
      chats,
      convexHomeChats,
      convexKodeChats,
      createChatRecord,
      createProjectRecord,
      renameProjectRecord,
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
