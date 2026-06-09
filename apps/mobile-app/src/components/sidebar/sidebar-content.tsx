import { Pressable, ScrollView, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  Bell,
  Bot,
  ChevronUp,
  ListChecks,
  MessageSquare,
  Palette,
  PanelLeft,
  Pin,
  Plus,
  Search,
  SquarePen,
} from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { ThemeMenu } from "@/components/mode-toggle";

type Chat = { id: string; title: string; color: string; pinned?: boolean };

const CHATS: Chat[] = [
  { id: "1", title: "Hello", color: "#34d399", pinned: true },
  { id: "2", title: "If 100 is the highest numbe…", color: "#9ca3af" },
  { id: "3", title: "Import failed", color: "#34d399" },
  { id: "4", title: "Import failed", color: "#34d399" },
  { id: "5", title: "create a task for me, I want…", color: "#9ca3af" },
  { id: "6", title: "I need you to do a research…", color: "#9ca3af" },
  { id: "7", title: "@notion create a content o…", color: "#9ca3af" },
  { id: "8", title: "@notion create a content o…", color: "#9ca3af" },
];

type SidebarContentProps = {
  onNavigate?: () => void;
};

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const router = useRouter();
  const go = (path: string) => {
    router.push(path as Href);
    onNavigate?.();
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-3 pt-1">
        <KontinueLogo height={22} />
        <View className="flex-row items-center gap-1">
          <Pressable hitSlop={6} className="h-9 w-9 items-center justify-center rounded-lg active:bg-accent">
            <Icon as={Bell} size={18} className="text-muted-foreground" />
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

      {/* Search */}
      <View className="mx-3 mb-3 h-11 flex-row items-center gap-2 rounded-xl border border-border bg-secondary px-3">
        <Icon as={Search} size={16} className="text-muted-foreground" />
        <Text className="flex-1 text-[14px] text-muted-foreground">Search threads…</Text>
        <View className="rounded-md bg-foreground/10 px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-muted-foreground">⌘K</Text>
        </View>
      </View>

      {/* New chat + palette */}
      <View className="mx-3 mb-2 flex-row gap-2">
        <Pressable
          onPress={() => go("/chat/new")}
          className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary active:opacity-90"
        >
          <Icon as={SquarePen} size={17} className="text-primary-foreground" />
          <Text className="text-[15px] font-semibold text-primary-foreground">New chat</Text>
        </Pressable>
        <ThemeMenu
          trigger={(open) => (
            <Pressable
              onPress={open}
              accessibilityLabel="Theme"
              className="h-12 w-12 items-center justify-center rounded-xl border border-border active:bg-accent"
            >
              <Icon as={Palette} size={18} className="text-muted-foreground" />
            </Pressable>
          )}
        />
      </View>

      {/* Tasks / Agents */}
      <View className="mx-3 mb-3 flex-row gap-2">
        <NavTile icon={ListChecks} label="Tasks" onPress={() => go("/tasks")} />
        <NavTile icon={Bot} label="Agents" onPress={() => go("/agents")} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerClassName="px-3 pb-4" showsVerticalScrollIndicator={false}>
        {/* Projects */}
        <SectionHeader label="Projects" action />
        <View className="mb-4 items-center rounded-xl border border-dashed border-border px-3 py-5">
          <Text className="text-[13px] text-muted-foreground">Create a project to group chats</Text>
        </View>

        {/* Recent chats */}
        <SectionHeader label="Recent chats" />
        {CHATS.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => go(`/chat/${c.id}`)}
            className="h-12 flex-row items-center gap-3 rounded-lg px-2 active:bg-accent"
          >
            <View
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: `${c.color}22` }}
            >
              <Icon as={MessageSquare} size={15} color={c.color} />
            </View>
            <Text numberOfLines={1} className="flex-1 text-[14px] text-foreground/90">
              {c.title}
            </Text>
            {c.pinned ? <Icon as={Pin} size={15} className="text-primary" /> : null}
            <Pressable hitSlop={8} className="h-6 w-6 items-center justify-center rounded-md active:bg-foreground/10">
              <Text className="text-[16px] leading-none text-muted-foreground">⋯</Text>
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>

      {/* Footer: account */}
      <View className="border-t border-border px-3 pb-2 pt-3">
        <Pressable
          onPress={() => go("/settings")}
          className="h-12 flex-row items-center gap-3 rounded-xl px-1 active:bg-accent"
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary">
            <Text className="text-[13px] font-bold text-foreground">D</Text>
          </View>
          <Text numberOfLines={1} className="flex-1 text-[14px] font-medium text-foreground">
            Damola Aderibigbe
          </Text>
          <View className="rounded-full border border-primary/40 px-2 py-0.5">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-primary">Free</Text>
          </View>
          <Icon as={ChevronUp} size={16} className="text-muted-foreground" />
        </Pressable>
      </View>
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
      className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-secondary active:opacity-80"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
      <Text className="text-[13.5px] font-medium text-secondary-foreground">{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ label, action }: { label: string; action?: boolean }) {
  return (
    <View className="mb-2 flex-row items-center justify-between px-2 pt-1">
      <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </Text>
      {action ? (
        <Pressable hitSlop={8} className="h-6 w-6 items-center justify-center rounded-md active:bg-accent">
          <Icon as={Plus} size={15} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
