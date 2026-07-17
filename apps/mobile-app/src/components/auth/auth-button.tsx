import { ActivityIndicator, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/components/theme-provider";
import { Text } from "@/components/ui/text";

/**
 * Primary call-to-action: a primary→primary/85 gradient pill with a primary
 * glow shadow and press-scale, matching the home "New chat" button.
 */
export function AuthButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { primary, primaryForeground } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        borderRadius: 14,
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: disabled ? undefined : `0 6px 18px ${primary}70`,
      })}
    >
      <LinearGradient
        colors={[primary, `${primary}D9`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 52,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
        }}
      >
        {loading ? <ActivityIndicator color={primaryForeground} size="small" /> : null}
        <Text className="text-[15px] font-semibold text-primary-foreground">
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Labeled input row used across the auth screens. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 h-px bg-border" />
      <Text variant="muted" className="text-xs uppercase tracking-widest">
        {label}
      </Text>
      <View className="flex-1 h-px bg-border" />
    </View>
  );
}
