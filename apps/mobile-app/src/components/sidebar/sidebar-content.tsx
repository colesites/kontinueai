import { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useUser, useClerk } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { planLabel } from "@repo/core/plan-tier";
import {
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Folder,
  FolderInput,
  FolderMinus,
  ListChecks,
  LogOut,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Palette,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  useDropdown,
} from "@/components/ui/dropdown";
import { useTheme } from "@/components/theme-provider";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { API_BASE_URL } from "@/lib/chat-api";

// Kept in sync with @repo/utils url-safety PROVIDER_CONFIG (that package's
// exports map doesn't resolve under Metro, so the colors live here too).
const PROVIDER_COLORS: Record<string, string> = {
  chatgpt: "#10a37f",
  claude: "#cc785c",
  gemini: "#4285f4",
  t3chat: "#f8e6f4",
  perplexity: "#20b8cd",
  mistral: "#9ca3af",
  kontinue: "#34d399",
};

type SidebarContentProps = {
  onNavigate?: () => void;
};

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const planTier = usePlanTier();
  const { primary } = useTheme();

  const chats = useQuery(api.chats.getUserChats, {});
  const projects = useQuery(api.projects.listProjects, {});
  const [search, setSearch] = useState("");
  const searchTerm = search.trim();
  // Server-side search matches message content too, not just titles.
  const searchResults = useQuery(
    api.chats.searchChats,
    searchTerm ? { query: searchTerm } : "skip",
  );
  const unreadCount = useQuery(api.notifications.unreadCount, {});
  const toggleChatPin = useMutation(api.chats.toggleChatPin);
  const deleteChat = useMutation(api.chats.deleteChat);
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const createProject = useMutation(api.projects.createProject);
  const updateProject = useMutation(api.projects.updateProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const assignChatToProject = useMutation(api.projects.assignChatToProject);

  // Anchored dropdowns — mirror the web's DropdownMenu (no bottom sheets).
  const accountMenu = useDropdown();
  const chatMenu = useDropdown();
  const projectMenu = useDropdown();
  const [menuChatId, setMenuChatId] = useState<Id<"chats"> | null>(null);
  // Drill-in view inside the chat menu, like the web's "Move to project" sub-menu.
  const [chatMenuView, setChatMenuView] = useState<"root" | "move">("root");
  const [renameChatId, setRenameChatId] = useState<Id<"chats"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [projectModal, setProjectModal] = useState<
    | { mode: "create" }
    | { mode: "rename"; projectId: Id<"projects"> }
    | null
  >(null);
  const [projectName, setProjectName] = useState("");
  const [menuProjectId, setMenuProjectId] = useState<Id<"projects"> | null>(null);

  const closeChatMenu = () => {
    chatMenu.close();
    setMenuChatId(null);
    setChatMenuView("root");
  };

  const go = (path: string) => {
    router.push(path as Href);
    onNavigate?.();
  };

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    if (!searchTerm) return chats;
    // Prefer the server results (they search message content too); fall back
    // to a local title filter while the query is in flight.
    if (searchResults !== undefined) return searchResults;
    const term = searchTerm.toLowerCase();
    return chats.filter((c) => c.title.toLowerCase().includes(term));
  }, [chats, searchTerm, searchResults]);

  const menuChat = (chats ?? []).find((c) => c._id === menuChatId) ?? null;
  const menuProject = projects?.find((p) => p._id === menuProjectId) ?? null;

  const handleTogglePin = async () => {
    if (!menuChat) return;
    const pinned = !(menuChat.pinnedAt && menuChat.pinnedAt > 0);
    closeChatMenu();
    try {
      await toggleChatPin({ chatId: menuChat._id, pinned });
    } catch {
      Alert.alert("Couldn't update pin", "Please try again.");
    }
  };

  const handleShare = () => {
    if (!menuChat) return;
    const url = `${API_BASE_URL}/share/${menuChat._id}`;
    closeChatMenu();
    void Clipboard.setStringAsync(url);
    Alert.alert("Link copied", "The share link is on your clipboard.");
  };

  const handleDelete = () => {
    if (!menuChat) return;
    const chatId = menuChat._id;
    const title = menuChat.title;
    closeChatMenu();
    Alert.alert("Delete chat?", `"${title}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteChat({ chatId }).catch(() =>
            Alert.alert("Couldn't delete chat", "Please try again."),
          );
        },
      },
    ]);
  };

  const openRename = () => {
    if (!menuChat) return;
    setRenameValue(menuChat.title);
    setRenameChatId(menuChat._id);
    closeChatMenu();
  };

  const handleRename = async () => {
    const title = renameValue.trim();
    const chatId = renameChatId;
    setRenameChatId(null);
    if (!chatId || !title) return;
    try {
      await updateChatTitle({ chatId, title });
    } catch {
      Alert.alert("Couldn't rename chat", "Please try again.");
    }
  };

  const handleProjectSave = async () => {
    const name = projectName.trim();
    const modal = projectModal;
    setProjectModal(null);
    setProjectName("");
    if (!name || !modal) return;
    try {
      if (modal.mode === "create") {
        await createProject({ name });
      } else {
        await updateProject({ projectId: modal.projectId, name });
      }
    } catch {
      Alert.alert("Couldn't save project", "Please try again.");
    }
  };

  const handleProjectDelete = () => {
    if (!menuProject) return;
    const projectId = menuProject._id;
    projectMenu.close();
    setMenuProjectId(null);
    Alert.alert(
      "Delete project?",
      `"${menuProject.name}" will be removed. Its chats move back to your unfiled list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteProject({ projectId }).catch(() =>
              Alert.alert("Couldn't delete project", "Please try again."),
            );
          },
        },
      ],
    );
  };

  const handleMoveToProject = (projectId: Id<"projects"> | null) => {
    const chatId = menuChatId;
    closeChatMenu();
    if (!chatId) return;
    assignChatToProject({ chatId, projectId }).catch(() =>
      Alert.alert("Couldn't move chat", "Please try again."),
    );
  };

  // Matches the drawer panel: 86% of screen, capped at 340.
  const sidebarWidth = Math.min(Dimensions.get("window").width * 0.86, 340);

  const initial =
    user?.firstName?.[0]?.toUpperCase() ??
    user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ??
    "?";
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account";

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
        <KontinueLogo height={22} />
        <View className="flex-row items-center gap-1">
          <Pressable
            hitSlop={6}
            onPress={() => go("/notifications")}
            className="h-9 w-9 items-center justify-center rounded-lg active:bg-accent"
          >
            <Icon as={Bell} size={18} className="text-muted-foreground" />
            {unreadCount ? (
              <View className="absolute right-1 top-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1">
                <Text className="text-[9px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={onNavigate}
            className="h-9 w-9 items-center justify-center rounded-lg active:bg-accent"
          >
            <Icon as={PanelLeft} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>
      </View>

      {/* Search — surface-inset, mirrors SidebarHeaderSection */}
      <View className="mx-3 mb-3 h-10 flex-row items-center gap-2 rounded-xl border border-foreground/5 bg-foreground/4 px-3">
        <Icon as={Search} size={14} className="text-muted-foreground/70" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search threads…"
          placeholderTextColor="#7c6c77"
          className="flex-1 text-[13px] text-foreground"
        />
        {search.length > 0 ? (
          <Pressable
            hitSlop={8}
            onPress={() => setSearch("")}
            className="h-6 w-6 items-center justify-center rounded-full active:bg-foreground/8"
          >
            <Icon as={X} size={12} strokeWidth={2.5} className="text-muted-foreground/70" />
          </Pressable>
        ) : (
          <View
            className="h-5 items-center justify-center border border-foreground/8 bg-foreground/5 px-1.5"
            style={{ borderRadius: 6 }}
          >
            <Text className="font-mono text-[10px] font-medium text-muted-foreground/60">⌘K</Text>
          </View>
        )}
      </View>

      {/* Row 1: primary New chat (gradient + glow) + Canvas palette button */}
      <View className="mx-3 mb-2 flex-row items-stretch gap-2">
        <Pressable
          onPress={() => go("/")}
          accessibilityLabel="Start new chat"
          style={({ pressed }) => [
            {
              flex: 1,
              borderRadius: 12,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              shadowColor: primary,
              shadowOpacity: 0.45,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 3 },
              elevation: 6,
            },
          ]}
        >
          <LinearGradient
            colors={[primary, `${primary}D9`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 12,
              paddingVertical: 11,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1,
              borderColor: `${primary}4D`,
            }}
          >
            <Icon as={MessageSquarePlus} size={16} className="text-primary-foreground" />
            <Text className="text-[13.5px] font-semibold text-primary-foreground">New chat</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={() => go("/canvas")}
          accessibilityLabel="Open Canvas"
          style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }] }]}
          className="h-10 w-10 items-center justify-center self-center rounded-xl border border-foreground/5 bg-foreground/4 active:bg-foreground/8"
        >
          <Icon as={Palette} size={15} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Row 2: Tasks + Agents */}
      <View className="mx-3 mb-2 flex-row gap-2">
        <NavTile icon={ListChecks} label="Tasks" onPress={() => go("/tasks")} />
        <NavTile icon={Bot} label="Agents" onPress={() => go("/agents")} />
      </View>

      {/* Row 3: Connectors */}
      <View className="mx-3 mb-3 flex-row">
        <NavTile icon={Plug} label="Connectors" onPress={() => go("/connectors")} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerClassName="px-3 pb-4" showsVerticalScrollIndicator={false}>
        {/* Projects */}
        <SectionHeader
          label="Projects"
          onAction={() => {
            setProjectName("");
            setProjectModal({ mode: "create" });
          }}
        />
        {projects && projects.length > 0 ? (
          <View className="mb-4">
            {projects.map((p) => (
              <Pressable
                key={p._id}
                onPress={() => go(`/project/${p._id}`)}
                onLongPress={(e) => {
                  setMenuProjectId(p._id);
                  projectMenu.open(e);
                }}
                className="h-11 flex-row items-center gap-3 rounded-lg px-2 active:bg-accent"
              >
                <Icon as={Folder} size={16} color={p.color ?? undefined} className={p.color ? undefined : "text-muted-foreground"} />
                <Text numberOfLines={1} className="flex-1 text-[14px] text-foreground/90">
                  {p.name}
                </Text>
                <Text className="text-[11px] text-muted-foreground/70">{p.chatCount}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setProjectName("");
              setProjectModal({ mode: "create" });
            }}
            className="mb-4 items-center rounded-xl border border-dashed border-border px-3 py-5 active:bg-accent"
          >
            <Text className="text-[13px] text-muted-foreground">
              Create a project to group chats
            </Text>
          </Pressable>
        )}

        {/* Recent chats */}
        <SectionHeader label="Recent chats" />
        {chats === undefined ? (
          <View className="gap-2 px-2 py-1">
            {[1, 2, 3, 4].map((i) => (
              <View key={i} className="h-10 rounded-lg bg-foreground/5" />
            ))}
          </View>
        ) : filteredChats.length === 0 ? (
          <View className="items-center px-3 py-6">
            <Icon as={MessageSquarePlus} size={20} className="text-muted-foreground/60" />
            <Text className="mt-2 text-center text-[13px] text-muted-foreground">
              {search ? "No chats match your search" : "Start a chat and it will show up here"}
            </Text>
          </View>
        ) : (
          filteredChats.map((c) => {
            const color = PROVIDER_COLORS[c.source.provider] ?? undefined;
            const pinned = !!c.pinnedAt && c.pinnedAt > 0;
            const openMenu = (e: Parameters<typeof chatMenu.open>[0]) => {
              setMenuChatId(c._id);
              setChatMenuView("root");
              chatMenu.open(e);
            };
            return (
              <Pressable
                key={c._id}
                onPress={() => go(`/chat/${c._id}`)}
                onLongPress={openMenu}
                className="h-11 flex-row items-center gap-2.5 rounded-xl px-2 active:bg-foreground/5"
              >
                {/* Provider chip — mirrors SidebarChatRow (explicit radius:
                    rounded-md doesn't always survive NativeWind here) */}
                <View
                  className="h-6 w-6 items-center justify-center border border-foreground/8 bg-foreground/5"
                  style={{ borderRadius: 7 }}
                >
                  <Icon
                    as={MessageCircle}
                    size={13}
                    strokeWidth={2.25}
                    color={color}
                    className={color ? undefined : "text-muted-foreground"}
                  />
                </View>
                <Text numberOfLines={1} className="flex-1 text-[14px] text-foreground/90">
                  {c.title}
                </Text>
                {pinned ? <Icon as={Pin} size={13} className="text-primary/70" /> : null}
                <Pressable
                  hitSlop={8}
                  onPress={openMenu}
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-foreground/10"
                >
                  <Text className="text-[16px] leading-none text-muted-foreground">⋯</Text>
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Footer: account — mirrors SidebarAccountSection (real avatar) */}
      <View className="border-t border-foreground/6 px-3 pb-2 pt-2.5">
        <Pressable
          onPress={accountMenu.open}
          className="flex-row items-center gap-2.5 rounded-xl px-2 py-1.5 active:bg-foreground/5"
        >
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(127,127,127,0.25)",
              }}
            />
          ) : (
            <View className="h-7 w-7 items-center justify-center rounded-full border border-primary/25 bg-primary/15">
              <Text className="text-[11px] font-semibold text-primary">{initial}</Text>
            </View>
          )}
          <Text numberOfLines={1} className="flex-1 text-[13px] font-medium text-foreground">
            {displayName}
          </Text>
          <View className="rounded-full border border-primary/25 bg-primary/12 px-1.5 py-0.5">
            <Text className="text-[9.5px] font-bold uppercase tracking-wider text-primary">
              {planLabel(planTier)}
            </Text>
          </View>
          <Icon as={ChevronUp} size={14} className="text-muted-foreground/60" />
        </Pressable>
      </View>

      {/* Chat actions dropdown — mirrors web SidebarChatActionsMenu */}
      <Dropdown visible={chatMenu.visible} anchor={chatMenu.anchor} onClose={closeChatMenu} width={176}>
        {chatMenuView === "root" ? (
          <>
            <DropdownItem
              icon={menuChat?.pinnedAt && menuChat.pinnedAt > 0 ? PinOff : Pin}
              label={menuChat?.pinnedAt && menuChat.pinnedAt > 0 ? "Unpin" : "Pin"}
              onPress={handleTogglePin}
            />
            <DropdownItem icon={Pencil} label="Rename" onPress={openRename} />
            <DropdownItem icon={Share2} label="Share" onPress={handleShare} />
            <DropdownItem
              icon={FolderInput}
              label="Move to project"
              onPress={() => setChatMenuView("move")}
              trailing={
                <Icon as={ChevronRight} size={14} className="text-muted-foreground/60" />
              }
            />
            <DropdownSeparator />
            <DropdownItem icon={Trash2} label="Delete" destructive onPress={handleDelete} />
          </>
        ) : (
          <>
            <DropdownItem
              icon={ChevronLeft}
              label="Back"
              onPress={() => setChatMenuView("root")}
            />
            <DropdownSeparator />
            {menuChat?.projectId ? (
              <DropdownItem
                icon={FolderMinus}
                label="Remove from project"
                onPress={() => handleMoveToProject(null)}
              />
            ) : null}
            {(projects ?? []).length === 0 ? (
              <View className="px-2.5 py-2">
                <Text className="text-[13px] text-muted-foreground">No projects yet</Text>
              </View>
            ) : (
              (projects ?? []).map((p) => (
                <DropdownItem
                  key={p._id}
                  icon={Folder}
                  label={p.name}
                  disabled={p._id === menuChat?.projectId}
                  onPress={() => handleMoveToProject(p._id)}
                />
              ))
            )}
          </>
        )}
      </Dropdown>

      {/* Project actions dropdown */}
      <Dropdown
        visible={projectMenu.visible}
        anchor={projectMenu.anchor}
        onClose={() => {
          projectMenu.close();
          setMenuProjectId(null);
        }}
        width={176}
      >
        <DropdownItem
          icon={Pencil}
          label="Rename"
          onPress={() => {
            if (!menuProject) return;
            setProjectName(menuProject.name);
            setProjectModal({ mode: "rename", projectId: menuProject._id });
            projectMenu.close();
            setMenuProjectId(null);
          }}
        />
        <DropdownSeparator />
        <DropdownItem icon={Trash2} label="Delete" destructive onPress={handleProjectDelete} />
      </Dropdown>

      {/* Create / rename project dialog */}
      <Modal
        visible={projectModal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setProjectModal(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-6"
          onPress={() => setProjectModal(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-popover p-5"
          >
            <Text className="mb-3 text-[16px] font-semibold text-foreground">
              {projectModal?.mode === "rename" ? "Rename project" : "New project"}
            </Text>
            <TextInput
              value={projectName}
              onChangeText={setProjectName}
              autoFocus
              placeholder="Project name"
              placeholderTextColor="#7c6c77"
              className="rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] text-foreground"
            />
            <View className="mt-4 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setProjectModal(null)}
                className="rounded-full px-4 py-2.5 active:bg-accent"
              >
                <Text className="text-[13px] font-medium text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!projectName.trim()}
                onPress={() => void handleProjectSave()}
                className={
                  projectName.trim()
                    ? "rounded-full bg-primary px-4 py-2.5 active:opacity-90"
                    : "rounded-full bg-primary/40 px-4 py-2.5"
                }
              >
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  {projectModal?.mode === "rename" ? "Save" : "Create"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename chat dialog */}
      <Modal
        visible={renameChatId !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRenameChatId(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-6"
          onPress={() => setRenameChatId(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-popover p-5"
          >
            <Text className="mb-3 text-[16px] font-semibold text-foreground">Rename chat</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              className="rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] text-foreground"
            />
            <View className="mt-4 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setRenameChatId(null)}
                className="rounded-full px-4 py-2.5 active:bg-accent"
              >
                <Text className="text-[13px] font-medium text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!renameValue.trim()}
                onPress={handleRename}
                className={
                  renameValue.trim()
                    ? "rounded-full bg-primary px-4 py-2.5 active:opacity-90"
                    : "rounded-full bg-primary/40 px-4 py-2.5"
                }
              >
                <Text className="text-[13px] font-semibold text-primary-foreground">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Account dropdown — opens upward above the footer, full sidebar
          width like the web's user menu */}
      <Dropdown
        visible={accountMenu.visible}
        anchor={accountMenu.anchor}
        onClose={accountMenu.close}
        placement="above"
        width={sidebarWidth - 16}
        left={8}
      >
        <View className="mb-1 flex-row items-center gap-3 rounded-xl bg-secondary/60 p-2.5">
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
            />
          ) : (
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
              <Text className="text-[14px] font-bold text-primary-foreground">{initial}</Text>
            </View>
          )}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[13px] font-semibold text-foreground">
              {displayName}
            </Text>
            <Text numberOfLines={1} className="text-[11.5px] text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress ?? ""}
            </Text>
          </View>
        </View>
        <DropdownItem
          icon={Settings}
          label="Settings"
          onPress={() => {
            accountMenu.close();
            go("/settings");
          }}
        />
        <DropdownItem
          icon={MessageSquare}
          label="Feedback"
          onPress={() => {
            accountMenu.close();
            void Linking.openURL(`${API_BASE_URL}/feedback`);
          }}
        />
        <DropdownItem
          icon={Sparkles}
          label="Upgrade"
          onPress={() => {
            accountMenu.close();
            // Checkout is Clerk-billing on the web; the in-app browser's
            // Done button drops the user straight back here.
            void WebBrowser.openBrowserAsync(`${API_BASE_URL}/pricing`);
          }}
        />
        <DropdownSeparator />
        <DropdownItem
          icon={LogOut}
          label="Sign out"
          destructive
          onPress={() => {
            accountMenu.close();
            void signOut();
          }}
        />
      </Dropdown>
    </View>
  );
}

function NavTile({
  icon,
  label,
  onPress,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-foreground/5 bg-foreground/4 px-4 py-2.5 active:bg-foreground/8"
    >
      <Icon as={icon} size={15} className="text-muted-foreground" />
      <Text className="text-[13px] font-medium text-muted-foreground">{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ label, onAction }: { label: string; onAction?: () => void }) {
  return (
    <View className="mb-2 flex-row items-center justify-between px-2 pt-1">
      <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </Text>
      {onAction ? (
        <Pressable
          hitSlop={8}
          onPress={onAction}
          className="h-6 w-6 items-center justify-center rounded-md active:bg-accent"
        >
          <Icon as={Plus} size={15} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
