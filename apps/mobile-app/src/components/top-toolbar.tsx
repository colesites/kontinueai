import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { PanelLeft, Plus, Search } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { ModeToggle } from "@/components/mode-toggle";
import { useSidebar } from "@/components/sidebar/sidebar-context";

/**
 * Floating top controls — mirrors web AppShell. The group "pill" is `rounded-2xl`
 * (not fully round); only the individual icon buttons inside are `rounded-full`.
 */
export function TopToolbar() {
  const { openSidebar } = useSidebar();
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-4 py-2">
      <View className="flex-row items-center gap-1 rounded-2xl border border-border p-1">
        <ToolbarButton label="Open sidebar" icon={PanelLeft} onPress={openSidebar} />
        <ToolbarButton label="Search" icon={Search} onPress={openSidebar} />
        <ToolbarButton label="New chat" icon={Plus} onPress={() => router.push("/chat/new")} />
      </View>

      <View className="rounded-2xl border border-border p-1">
        <ModeToggle />
      </View>
    </View>
  );
}

function ToolbarButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: typeof PanelLeft;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
    >
      <Icon as={icon} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}
