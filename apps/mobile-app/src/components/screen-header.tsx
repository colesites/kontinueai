import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, PanelLeft } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSidebar } from "@/components/sidebar/sidebar-context";

type ScreenHeaderProps = {
  title: string;
  /** "menu" opens the sidebar; "back" pops the stack. */
  leading?: "menu" | "back";
  right?: ReactNode;
};

export function ScreenHeader({
  title,
  leading = "menu",
  right,
}: ScreenHeaderProps) {
  const router = useRouter();
  const { openSidebar } = useSidebar();

  const onLeading = () => {
    if (leading === "back") router.back();
    else openSidebar();
  };

  return (
    <View className="flex-row items-center gap-1 px-4 pb-2 pt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={leading === "back" ? "Go back" : "Open sidebar"}
        onPress={onLeading}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-xl active:bg-accent"
      >
        <Icon
          as={leading === "back" ? ChevronLeft : PanelLeft}
          size={leading === "back" ? 22 : 19}
          className="text-muted-foreground"
        />
      </Pressable>
      <Text className="flex-1 text-lg font-semibold text-foreground">
        {title}
      </Text>
      {right}
    </View>
  );
}
