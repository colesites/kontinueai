import { ActivityIndicator, Pressable } from "react-native";

import { Text } from "@/components/ui/text";
import GoogleIcon from "@/assets/images/google.svg";

/** "Continue with Google" button using the real Google mark (google.svg). */
export function GoogleButton({
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled}
      className="h-[52px] flex-row items-center justify-center gap-3 rounded-[14px] border border-[#d8dadd] bg-white active:opacity-90"
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color="#1f1f1f" />
      ) : (
        <GoogleIcon width={19} height={19} />
      )}
      <Text className="text-[15px] font-semibold" style={{ color: "#1f1f1f" }}>
        {label}
      </Text>
    </Pressable>
  );
}
