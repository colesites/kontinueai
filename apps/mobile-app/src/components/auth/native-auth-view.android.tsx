import { useCallback } from "react";
import type { ComponentType } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import NativeClerkAuthView from "@clerk/expo/dist/specs/NativeClerkAuthView.android";

type AuthViewMode = "signIn" | "signUp" | "signInOrUp";

type AuthEvent = Readonly<{
  nativeEvent: Readonly<{
    type: string;
  }>;
}>;

type NativeClerkAuthViewProps = ViewProps & {
  mode?: string;
  isDismissible?: boolean;
  onAuthEvent?: (event: AuthEvent) => void;
};

type NativeAuthViewProps = {
  mode?: AuthViewMode;
  isDismissible?: boolean;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

const AndroidClerkAuthView =
  NativeClerkAuthView as ComponentType<NativeClerkAuthViewProps>;

export function NativeAuthView({
  mode = "signInOrUp",
  isDismissible = true,
  onDismiss,
  style,
}: NativeAuthViewProps) {
  const handleAuthEvent = useCallback(
    (event: AuthEvent) => {
      if (event.nativeEvent.type === "dismissed") {
        onDismiss?.();
      }
    },
    [onDismiss],
  );

  return (
    <AndroidClerkAuthView
      style={[{ flex: 1 }, style]}
      mode={mode}
      isDismissible={isDismissible}
      onAuthEvent={handleAuthEvent}
    />
  );
}
