import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { SidebarContent } from "./sidebar-content";
import { useSidebar } from "./sidebar-context";

/**
 * Slide-over navigation drawer (left), drawn in the app's own tree rather than
 * a Modal. A Modal unmounted the sidebar on every close, so each open started
 * its Convex queries from scratch and showed the loading state again. The
 * panel now stays mounted once opened and just slides off-screen.
 */
export function AppDrawer() {
  const { open, closeSidebar } = useSidebar();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 340);
  const progress = useSharedValue(0);
  // Mount lazily on first open, then keep the content (and its live data).
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    progress.set(
      withTiming(open ? 1 : 0, {
        duration: open ? 260 : 200,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      }),
    );
  }, [open, progress]);

  // Android back closes the drawer first, like the Modal did.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeSidebar();
      return true;
    });
    return () => sub.remove();
  }, [closeSidebar, open]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.get() - 1) * (panelWidth + 24) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  if (!mounted) return null;

  return (
    <View
      pointerEvents={open ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, { zIndex: 500, elevation: 500 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Pressable
          accessibilityLabel="Close sidebar"
          onPress={closeSidebar}
          className="bg-black/50"
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        className="border-r border-border bg-background"
        style={[
          { position: "absolute", top: 0, bottom: 0, left: 0, width: panelWidth },
          panelStyle,
        ]}
      >
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left"]}>
          <SidebarContent onNavigate={closeSidebar} />
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}
