import { mergeWorkspaces, readSharedWorkspace, writeSharedWorkspace } from "./kode-shared-workspace";
import { resolveFolderForPath } from "./kode-import-remote";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { getSettings } from "./app-settings";
import { homeDir } from "@tauri-apps/api/path";
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
  useRef,
} from "react";

import {
  api,
  type HomeConvexChat,
  type HomeConvexProject,
  type KodeConvexChat,
} from "@/lib/convex-api";
import { removeImportContext } from "@/lib/kode-import";

// Projects are LOCAL imported folders (stored on this machine), and the
// chat → folder grouping is kept locally too. Chats themselves live in Convex.
const FOLDERS_KEY = "kontinue:kode-folders:v1";
const CHAT_FOLDER_KEY = "kontinue:kode-chat-folder:v1";
const SHARED_MIGRATED_KEY = "kontinue:kode-shared-workspace:v1";

export type KodeFolder = { id: string; name: string; path: string };

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
  /** Where an imported chat came from (synced across devices by Convex). */
  importSource?: KodeConvexChat["importSource"];
};

/** Home, Canvas and Tasks share the Home sidebar; Kode has its own. */
export type KodeTab = "home" | "canvas" | "tasks" | "kode";

export type KodeImportInput = {
  title: string;
  provider: string;
  sessionId: string;
  projectPath?: string | null;
  lastActivity?: number | null;
  model?: string | null;
  messages: {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: number | null;
  }[];
  folderId?: string | null;
};

export type SettingsNavTab =
  | "general"
  | "appearance"
  | "usage"
  | "models"
  | "providers"
  | "connectors"
  | "customize"
  | "plugins"
  | "agents"
  | "skills"
  | "mcp"
  | "shortcuts"
  | "snapshots"
  | "scheduled"
  | "source-control"
  | "storage"
  | "webhooks"
  | "account"
  | "data";

type KodeWorkspaceContextValue = {
  activeTab: KodeTab;
  setActiveTab: (tab: KodeTab) => void;
  isSettingsOpen: boolean;
  settingsTab: SettingsNavTab;
  openSettings: (tab?: string) => void;
  closeSettings: () => void;
  projects: KodeProject[];
  chats: KodeChat[];
  chatsLoading: boolean;
  activeChatId: string | null;
  draftProjectId: string | null;
  importFolder: () => Promise<void>;
  removeFolder: (folderId: string) => void;
  /** Reuse a folder for `path`, or add it and return its new local id. */
  ensureFolder: (path: string) => string;
  /** Persist a normalized imported coding session as a Kode chat. */
  importKodeSession: (input: KodeImportInput) => Promise<string>;
  /** Append new turns from a previously imported coding session. */
  appendImportedMessages: (input: {
    chatId: string;
    expectedMessageCount: number;
    model?: string | null;
    messages: KodeImportInput["messages"];
  }) => Promise<number>;
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
  createKodeChatRecord: (input: {
    title: string;
    projectId?: string | null;
  }) => Promise<string>;
  /** Put these chats under a local folder (project moved from another machine). */
  assignChatsToFolder: (chatIds: string[], folderId: string) => void;
  /** Local project folders (independent of the active tab). */
  folders: { id: string; name: string; path: string }[];
  /** Kode chats (independent of the active tab). */
  kodeChats: KodeChat[];
  addMessageRecord: (input: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
    model?: string;
    tokens?: number;
    sources?: { title: string; url: string }[];
    todos?: { title: string; description?: string; status: string }[];
  }) => Promise<string>;
  togglePinChat: (chatId: string, pinned: boolean) => Promise<void>;
  archiveChat: (chatId: string, archived: boolean) => Promise<void>;
  archiveKodeChat: (chatId: string, archived: boolean) => Promise<void>;
  deleteChat: (chatId: string, kind?: "home" | "kode") => Promise<void>;
  /** Archived chats from both Chat and Kode (Settings → Data). */
  archivedChats: { id: string; title: string; updatedAt: number; kind: "home" | "kode" }[];
  setChatArchived: (chatId: string, kind: "home" | "kode", archived: boolean) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  rewindAfter: (messageId: string) => Promise<void>;
};

const KodeWorkspaceContext = createContext<KodeWorkspaceContextValue | null>(
  null,
);

export function KodeWorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<KodeTab>("home");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsNavTab>("general");

  const openSettings = useCallback((tab?: string) => {
    if (tab) {
      // Older ids still used by some callers.
      const aliases: Record<string, SettingsNavTab> = {
        byok: "providers",
        models: "providers",
        integrations: "connectors",
        keybindings: "shortcuts",
        archive: "data",
      };
      setSettingsTab(aliases[tab] ?? (tab as SettingsNavTab));
    }
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const [activeHomeChatId, setActiveHomeChatId] = useState<string | null>(null);
  const [activeKodeChatId, setActiveKodeChatId] = useState<string | null>(null);
  const activeChatId = activeTab === "home" ? activeHomeChatId : activeKodeChatId;
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const foldersRef = useRef<KodeFolder[]>([]);
  const [folders, setFolders] = useState<KodeFolder[]>(() =>
    loadJSON<KodeFolder[]>(FOLDERS_KEY, []),
  );
  foldersRef.current = folders;
  const chatFolderRef = useRef<Record<string, string>>({});
  // chatId → local folder id
  const [chatFolder, setChatFolder] = useState<Record<string, string>>(() =>
    loadJSON<Record<string, string>>(CHAT_FOLDER_KEY, {}),
  );
  chatFolderRef.current = chatFolder;

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
  const updateHomeChatTitle = useMutation(api.chats.updateChatTitle);
  const deleteHomeChatMutation = useMutation(api.chats.deleteChat);

  // Mutations for Kode tab (kodeChats / kodeMessages)
  const createKodeChat = useMutation(api.kode.createChat);
  const importKodeSessionMutation = useMutation(api.kode.importSession);
  const appendImportedMessagesMutation = useMutation(
    api.kode.appendImportedMessages,
  );
  const addKodeMessage = useMutation(api.kode.addMessage);
  const toggleKodeChatPin = useMutation(api.kode.toggleChatPin);
  const setKodeChatArchived = useMutation(api.kode.setChatArchived);
  const updateKodeChatTitle = useMutation(api.kode.updateChatTitle);
  const deleteKodeChatMutation = useMutation(api.kode.deleteChat);
  const deleteKodeMessagesAfter = useMutation(api.kode.deleteMessagesAfter);

  // Shared project list (every copy of the app): merge this copy's list in
  // once, then the shared file is the source of truth for both.
  const sharedLoaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void readSharedWorkspace().then((shared) => {
      if (cancelled) return;
      const local = { folders: foldersRef.current, chatFolder: chatFolderRef.current };
      const migrated = window.localStorage.getItem(SHARED_MIGRATED_KEY) === "1";
      const next = shared ? (migrated ? mergeWorkspaces(shared, { folders: [], chatFolder: {} }) : mergeWorkspaces(shared, local)) : local;
      window.localStorage.setItem(SHARED_MIGRATED_KEY, "1");
      sharedLoaded.current = true;
      setFolders(next.folders);
      setChatFolder(next.chatFolder);
      void writeSharedWorkspace(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (sharedLoaded.current) void writeSharedWorkspace({ folders, chatFolder });
  }, [folders, chatFolder]);

  useEffect(() => {
    window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);
  useEffect(() => {
    window.localStorage.setItem(CHAT_FOLDER_KEY, JSON.stringify(chatFolder));
  }, [chatFolder]);

  // Projects list: Home tab (and Canvas) shows Convex projects, Kode tab shows local imported folders
  const projects = useMemo<KodeProject[]>(() => {
    if (activeTab !== "kode") {
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

  const kodeChats = useMemo<KodeChat[]>(() => {
    return (convexKodeChats ?? [])
      .filter((chat: KodeConvexChat) => !chat.archived)
      .map((chat: KodeConvexChat) => ({
        id: chat._id,
        title: chat.title,
        // On another device an imported chat has no local folder yet: match
        // the folder by path, then by name (cross-device project context).
        projectId:
          chatFolder[chat._id] ??
          resolveFolderForPath(chat.importSource?.projectPath, folders)?.id ??
          null,
        importSource: chat.importSource,
        updatedAt: chat.lastMessageAt ?? chat.updatedAt,
        pinnedAt:
          typeof chat.pinnedAt === "number" && chat.pinnedAt > 0
            ? chat.pinnedAt
            : null,
        archived: Boolean(chat.archived),
      }));
  }, [convexKodeChats, chatFolder, folders]);

  // Chats list: Home tab (and Canvas) shows `chats` table, Kode tab shows `kodeChats` table
  const chats = useMemo<KodeChat[]>(() => {
    if (activeTab !== "kode") {
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
    return kodeChats;
  }, [activeTab, convexHomeChats, kodeChats]);

  const importFolder = useCallback(async () => {
    // Settings → General → Add project starts in ("~/" when empty).
    const startDir = getSettings().addProjectDir.trim();
    const home = await homeDir().catch(() => "");
    const defaultPath = startDir ? startDir.replace(/^~(?=\/|$)/, home.replace(/\/$/, "")) : home || undefined;
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Import folder",
      defaultPath,
    });

    if (typeof selected !== "string") return;

    const path = selected;
    const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;

    // Pick the folder for the next chat outside the state updater, so it
    // can't be lost (updaters may run twice and must not set other state).
    const existing = foldersRef.current.find((folder) => folder.path === path);
    const folder: KodeFolder = existing ?? { id: `folder-${Date.now()}`, name, path };
    if (!existing) {
      setFolders((current) => (current.some((entry) => entry.path === path) ? current : [...current, folder]));
    }
    setActiveKodeChatId(null);
    setDraftProjectId(folder.id);
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

  // Importing a coding session may point at a folder that is not in the local
  // project list yet. Add it (idempotently) so the imported chat has a real
  // project root for file tools, and return the id to attach to the chat.
  const ensureFolder = useCallback(
    (path: string) => {
      const existing = folders.find((folder) => folder.path === path);
      if (existing) return existing.id;

      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
      const folder: KodeFolder = {
        id: `folder-${hashPath(path)}`,
        name,
        path,
      };
      setFolders((current) =>
        current.some((entry) => entry.path === path)
          ? current
          : [...current, folder],
      );
      return folder.id;
    },
    [folders],
  );

  const importKodeSession = useCallback(
    async (input: KodeImportInput) => {
      const chatId = await importKodeSessionMutation({
        title: toChatTitle(input.title),
        provider: input.provider,
        sessionId: input.sessionId,
        projectPath: input.projectPath ?? undefined,
        lastActivity: input.lastActivity ?? undefined,
        model: input.model ?? undefined,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp ?? undefined,
        })),
      });

      if (input.folderId) {
        const folderId = input.folderId;
        setChatFolder((current) => ({ ...current, [chatId]: folderId }));
      }

      setActiveKodeChatId(chatId);
      setDraftProjectId(null);
      setActiveTab("kode");
      return chatId;
    },
    [importKodeSessionMutation],
  );

  const appendImportedMessages = useCallback(
    async (input: {
      chatId: string;
      expectedMessageCount: number;
      model?: string | null;
      messages: KodeImportInput["messages"];
    }) => {
      return await appendImportedMessagesMutation({
        chatId: input.chatId as any,
        expectedMessageCount: input.expectedMessageCount,
        model: input.model ?? undefined,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp ?? undefined,
        })),
      });
    },
    [appendImportedMessagesMutation],
  );

  const newChat = useCallback((projectId: string | null = null) => {
    if (activeTab !== "kode") {
      setActiveHomeChatId(null);
      if (activeTab === "canvas" || activeTab === "tasks") {
        setActiveTab("home");
      }
    } else {
      setActiveKodeChatId(null);
    }
    setDraftProjectId(projectId);
  }, [activeTab]);

  const selectChat = useCallback((chatId: string) => {
    if (activeTab !== "kode") {
      setActiveHomeChatId(chatId);
      if (activeTab === "canvas" || activeTab === "tasks") {
        setActiveTab("home");
      }
    } else {
      setActiveKodeChatId(chatId);
    }
    setDraftProjectId(null);
  }, [activeTab]);

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
      if (activeTab !== "kode") {
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

  const assignChatsToFolder = useCallback((chatIds: string[], folderId: string) => {
    setChatFolder((current) => {
      const next = { ...current };
      for (const chatId of chatIds) next[chatId] = folderId;
      return next;
    });
  }, []);

  // Always a Kode chat, whatever tab is open (used by the orchestration MCP).
  const createKodeChatRecord = useCallback(
    async ({ title, projectId }: { title: string; projectId?: string | null }) => {
      const chatId = await createKodeChat({ title: toChatTitle(title) });
      if (projectId) setChatFolder((current) => ({ ...current, [chatId]: projectId }));
      return chatId as string;
    },
    [createKodeChat],
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

      if (activeTab !== "kode") {
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
      if (activeTab !== "kode") {
        return await addHomeMessage({
          chatId: input.chatId as any,
          role: input.role,
          content: input.content,
          model: input.model,
          sources: input.sources,
          todos: input.todos,
        });
      }
      return await addKodeMessage({
          chatId: input.chatId as any,
          role: input.role,
          content: input.content,
          model: input.model,
          tokens: input.tokens,
          sources: input.sources,
          todos: input.todos,
        });
    },
    [activeTab, addHomeMessage, addKodeMessage],
  );

  const togglePinChat = useCallback(
    async (chatId: string, pinned: boolean) => {
      // Settings → General → Confirmations → Unpin confirmation.
      if (!pinned && getSettings().confirmUnpin) {
        const ok = await ask("Unpin this chat?", { title: "Unpin chat", okLabel: "Unpin" }).catch(() => true);
        if (!ok) return;
      }
      if (activeTab !== "kode") {
        await toggleHomeChatPin({ chatId: chatId as any, pinned });
      } else {
        await toggleKodeChatPin({ chatId: chatId as any, pinned });
      }
    },
    [activeTab, toggleHomeChatPin, toggleKodeChatPin],
  );

  const archivedChats = useMemo(() => {
    type Raw = { _id: string; title?: string; updatedAt?: number; _creationTime?: number; archived?: boolean };
    const pick = (list: Raw[] | undefined, kind: "home" | "kode") =>
      (list ?? [])
        .filter((chat) => chat.archived)
        .map((chat) => ({ id: chat._id, title: chat.title ?? "Untitled", updatedAt: chat.updatedAt ?? chat._creationTime ?? 0, kind }));
    return [...pick(convexHomeChats as Raw[] | undefined, "home"), ...pick(convexKodeChats as Raw[] | undefined, "kode")].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [convexHomeChats, convexKodeChats]);

  const setChatArchived = useCallback(
    async (chatId: string, kind: "home" | "kode", archived: boolean) => {
      if (kind === "home") await setHomeChatArchived({ chatId: chatId as any, archived });
      else await setKodeChatArchived({ chatId: chatId as any, archived });
    },
    [setHomeChatArchived, setKodeChatArchived],
  );

  /** Archive a Kode chat whatever tab is open (auto-archive). */
  const archiveKodeChat = useCallback(
    async (chatId: string, archived: boolean) => {
      await setKodeChatArchived({ chatId: chatId as any, archived });
    },
    [setKodeChatArchived],
  );

  const archiveChat = useCallback(
    async (chatId: string, archived: boolean) => {
      if (activeTab !== "kode") {
        await setHomeChatArchived({ chatId: chatId as any, archived });
      } else {
        await setKodeChatArchived({ chatId: chatId as any, archived });
      }
    },
    [activeTab, setHomeChatArchived, setKodeChatArchived],
  );

  const deleteChat = useCallback(
    async (chatId: string, kind?: "home" | "kode") => {
      // Settings → General → Confirmations.
      if (getSettings().confirmDelete) {
        const ok = await ask("Delete this chat and its history? This can't be undone.", {
          title: "Delete chat",
          kind: "warning",
          okLabel: "Delete",
        }).catch(() => window.confirm("Delete this chat and its history? This can't be undone."));
        if (!ok) return;
      }
      if ((kind ?? (activeTab === "kode" ? "kode" : "home")) === "home") {
        await deleteHomeChatMutation({ chatId: chatId as any });
        setActiveHomeChatId((current) => (current === chatId ? null : current));
      } else {
        await deleteKodeChatMutation({ chatId: chatId as any });
        setActiveKodeChatId((current) => (current === chatId ? null : current));
      }
      setChatFolder((current) => {
        if (!(chatId in current)) return current;
        const next = { ...current };
        delete next[chatId];
        return next;
      });
      removeImportContext(chatId);
    },
    [activeTab, deleteHomeChatMutation, deleteKodeChatMutation],
  );

  const renameChat = useCallback(
    async (chatId: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      if (activeTab !== "kode") {
        await updateHomeChatTitle({ chatId: chatId as any, title: clean });
      } else {
        await updateKodeChatTitle({ chatId: chatId as any, title: clean });
      }
    },
    [activeTab, updateHomeChatTitle, updateKodeChatTitle],
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
      isSettingsOpen,
      settingsTab,
      openSettings,
      closeSettings,
      projects,
      chats,
      chatsLoading:
        activeTab !== "kode"
          ? convexHomeChats === undefined
          : convexKodeChats === undefined,
      activeChatId,
      draftProjectId,
      importFolder,
      removeFolder,
      ensureFolder,
      importKodeSession,
      appendImportedMessages,
      newChat,
      selectChat,
      createProjectRecord,
      renameProjectRecord,
      createChatRecord,
      createKodeChatRecord,
      assignChatsToFolder,
      folders,
      kodeChats,
      addMessageRecord,
      togglePinChat,
      archiveChat,
      archiveKodeChat,
      archivedChats,
      setChatArchived,
      deleteChat,
      renameChat,
      rewindAfter,
    }),
    [
      activeTab,
      isSettingsOpen,
      settingsTab,
      openSettings,
      closeSettings,
      activeChatId,
      addMessageRecord,
      archiveChat,
      archiveKodeChat,
      archivedChats,
      setChatArchived,
      chats,
      convexHomeChats,
      convexKodeChats,
      createChatRecord,
      createKodeChatRecord,
      assignChatsToFolder,
      folders,
      kodeChats,
      createProjectRecord,
      renameProjectRecord,
      deleteChat,
      draftProjectId,
      importFolder,
      ensureFolder,
      importKodeSession,
      appendImportedMessages,
      newChat,
      projects,
      removeFolder,
      renameChat,
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

/** Stable local folder id for a path (folder may not exist in the list yet). */
function hashPath(path: string) {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash).toString(36)}-${path.length.toString(36)}`;
}
