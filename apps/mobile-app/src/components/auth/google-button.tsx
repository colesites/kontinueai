import { Pressable } from "react-native";

import { Text } from "@/components/ui/text";
import GoogleIcon from "@/assets/images/google.svg";

/** "Continue with Google" button using the real Google mark (google.svg). */
export function GoogleButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="h-12 flex-row items-center justify-center gap-3 rounded-xl border border-border bg-white active:opacity-90"
    >
      <GoogleIcon width={19} height={19} />
      <Text className="text-[15px] font-semibold" style={{ color: "#1f1f1f" }}>
        {label}
      </Text>
    </Pressable>
  );
}
