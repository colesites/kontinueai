import type { PropsWithChildren } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

export function ScreenBackground({ children }: PropsWithChildren) {
  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      {children}
    </SafeAreaView>
  );
}
