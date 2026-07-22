import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { PanelLeft, Plus, Search } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { ModeToggle } from "@/components/mode-toggle";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { GlassView } from "@/components/ui/glass";
import { useTheme } from "@/components/theme-provider";

/**
 * Floating top controls — mirrors web AppShell. The group "pill" is `rounded-2xl`
 * (not fully round); only the individual icon buttons inside are `rounded-full`.
 */
export function TopToolbar() {
  const { openSidebar } = useSidebar();
  const router = useRouter();
  const { isDark } = useTheme();

  const glassStyle = {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 15,
    elevation: 8,
  };

  return (
    <View className="flex-row items-center justify-between px-4 py-2 mt-2">
      <GlassView
        intensity={40}
        style={glassStyle}
        className="flex-row items-center gap-1.5 p-1"
      >
        <ToolbarButton label="Open sidebar" icon={PanelLeft} onPress={openSidebar} />
        <ToolbarButton label="Search" icon={Search} onPress={openSidebar} />
        <ToolbarButton label="New chat" icon={Plus} onPress={() => router.push("/chat/new")} />
      </GlassView>

      <GlassView
        intensity={40}
        style={glassStyle}
        className="p-1"
      >
        <ModeToggle />
      </GlassView>
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
