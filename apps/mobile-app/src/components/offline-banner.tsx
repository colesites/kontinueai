import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { GlassView } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

// Short drops (switching networks, a backgrounded socket waking up) heal on
// their own; only say something when the link stays down.
const SHOW_AFTER_MS = 2500;

/**
 * "You're offline" pill. Driven by the Convex socket rather than a native
 * network module: it reflects whether Kontinue itself is reachable (captive
 * Wi-Fi, a dead network, our backend), needs no extra native dependency, and
 * Convex already queues mutations and reconnects underneath it.
 */
export function OfflineBanner() {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const { primary } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const wasShownRef = useRef(false);
  const disconnected = hasEverConnected && !isWebSocketConnected;

  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (!disconnected) {
          if (wasShownRef.current) {
            wasShownRef.current = false;
            toast.success("Back online", { duration: 2200 });
          }
          setVisible(false);
          return;
        }
        // A socket closed while the app sat in the background isn't news.
        if (AppState.currentState !== "active") return;
        wasShownRef.current = true;
        setVisible(true);
      },
      disconnected ? SHOW_AFTER_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [disconnected]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + 6,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 900,
        elevation: 900,
      }}
    >
      <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(160)}>
        <GlassView
          intensity={50}
          className="flex-row items-center gap-2 px-3.5 py-2"
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(127,127,127,0.25)",
          }}
        >
          <Icon as={WifiOff} size={13} className="text-destructive" />
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-[12.5px] font-semibold text-foreground"
          >
            You&apos;re offline
          </Text>
          <Text className="text-[12px] text-muted-foreground">Reconnecting</Text>
          <ActivityIndicator size="small" color={primary} />
        </GlassView>
      </Animated.View>
    </View>
  );
}
