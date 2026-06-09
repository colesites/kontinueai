import { TextInput, View, type TextInputProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/components/theme-provider";

type AuthFieldProps = TextInputProps & {
  icon: LucideIcon;
};

/** Icon-prefixed text field used across the auth screens. */
export function AuthField({ icon, ...props }: AuthFieldProps) {
  const { isDark } = useTheme();
  return (
    <View className="h-12 flex-row items-center gap-2.5 rounded-xl border border-border bg-secondary px-3.5">
      <Icon as={icon} size={17} className="text-muted-foreground" />
      <TextInput
        placeholderTextColor={isDark ? "#7c6c77" : "#9b8893"}
        className="flex-1 text-[15px] text-foreground"
        style={{ flex: 1 }}
        {...props}
      />
    </View>
  );
}
