declare module "@clerk/expo/dist/specs/NativeClerkAuthView.android" {
  import type { ComponentType } from "react";
  import type { ViewProps } from "react-native";

  type AuthEvent = Readonly<{
    nativeEvent: Readonly<{
      type: string;
    }>;
  }>;

  type NativeProps = ViewProps & {
    mode?: string;
    isDismissible?: boolean;
    onAuthEvent?: (event: AuthEvent) => void;
  };

  const NativeClerkAuthView: ComponentType<NativeProps>;
  export default NativeClerkAuthView;
}
