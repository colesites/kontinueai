import { useState, type ComponentProps } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type AuthFieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  leadingIcon: LucideIcon;
  password?: boolean;
};

/**
 * Auth-only field with strong native contrast, a 56px control, stable icon
 * alignment, and a reserved password accessory. The shared shadcn Input is
 * intentionally compact for dense app forms and was too small for auth.
 */
export function AuthField({
  label,
  leadingIcon,
  password = false,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: AuthFieldProps) {
  const { primary, mutedForeground, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const borderColor = focused
    ? primary
    : isDark
      ? "rgba(255,255,255,0.18)"
      : "rgba(15,23,42,0.16)";
  const backgroundColor = isDark
    ? "rgba(4,3,5,0.74)"
    : "rgba(255,255,255,0.84)";

  return (
    <View>
      <Text className="mb-2 text-[13px] font-semibold tracking-[0.1px] text-foreground">
        {label}
      </Text>
      <View
        className="h-14 flex-row items-center overflow-hidden rounded-[14px] border"
        style={{
          borderColor,
          backgroundColor,
          boxShadow: focused ? `0 0 0 3px ${primary}1F` : undefined,
          opacity: editable ? 1 : 0.58,
        }}
      >
        <View className="h-14 w-12 items-center justify-center">
          <Icon
            as={leadingIcon}
            size={18}
            color={focused ? primary : mutedForeground}
          />
        </View>
        <TextInput
          {...props}
          editable={editable}
          secureTextEntry={password && !passwordVisible}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={mutedForeground}
          selectionColor={primary}
          className="min-w-0 flex-1 text-[15px] text-foreground"
          style={{
            height: 54,
            paddingHorizontal: 0,
            paddingVertical: 0,
            lineHeight: 20,
            includeFontPadding: false,
          }}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Hide password" : "Show password"
            }
            accessibilityState={{ expanded: passwordVisible }}
            hitSlop={2}
            onPress={() => setPasswordVisible((visible) => !visible)}
            className="h-12 w-12 items-center justify-center rounded-xl active:bg-foreground/5"
          >
            <Icon
              as={passwordVisible ? EyeOff : Eye}
              size={19}
              color={focused ? primary : mutedForeground}
            />
          </Pressable>
        ) : (
          <View className="w-4" />
        )}
      </View>
    </View>
  );
}

export function AuthError({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-3"
    >
      <Icon as={AlertCircle} size={17} className="mt-0.5 text-destructive" />
      <Text className="min-w-0 flex-1 text-[12.5px] leading-5 text-destructive">
        {message}
      </Text>
    </View>
  );
}

export function AuthNotice({ message }: { message: string }) {
  const { isDark } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3"
    >
      <Icon
        as={CheckCircle2}
        size={17}
        color={isDark ? "#6ee7b7" : "#059669"}
        className="mt-0.5"
      />
      <Text
        className="min-w-0 flex-1 text-[12.5px] leading-5"
        style={{ color: isDark ? "#a7f3d0" : "#047857" }}
      >
        {message}
      </Text>
    </View>
  );
}
