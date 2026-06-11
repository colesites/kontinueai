import { useEffect, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * Real backdrop blur — the mobile analogue of the web's `glass` /
 * `glass-strong` utilities (translucent background + blur + hairline border).
 */
export function GlassView({
  children,
  intensity = 40,
  style,
  className,
}: {
  children: ReactNode;
  /** Blur strength — web glass ≈ 24, glass-strong ≈ 40. */
  intensity?: number;
  style?: ViewStyle | ViewStyle[];
  className?: string;
}) {
  const { isDark } = useTheme();
  return (
    <BlurView
      intensity={intensity}
      tint={isDark ? "dark" : "light"}
      experimentalBlurMethod="dimezisBlurView"
      className={className}
      style={[{ overflow: "hidden" }, ...(Array.isArray(style) ? style : style ? [style] : [])]}
    >
      {children}
    </BlurView>
  );
}

/** The web dialog's top accent: a 1px primary gradient strip. */
export function AccentBar() {
  const { primary } = useTheme();
  return (
    <LinearGradient
      colors={["transparent", `${primary}80`, "transparent"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ height: 1 }}
    />
  );
}

/**
 * Centered glass dialog — mirrors the web DialogContent recipe: glass-strong
 * panel, accent bar, close pill top-right, zoom/fade entrance animation.
 */
export function GlassDialog({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { isDark } = useTheme();
  // Lazy useState (not useRef) so the animated value is created once without
  // reading a ref during render, which React Compiler forbids.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 260,
      }).start();
    }
  }, [visible, progress]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 px-5"
      >
        <Animated.View
          style={{
            width: "100%",
            maxWidth: 420,
            opacity: progress,
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.95, 1],
                }),
              },
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <GlassView
              intensity={50}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
                // glass-strong keeps ~78% of the background color
                backgroundColor: isDark
                  ? "rgba(12,9,12,0.78)"
                  : "rgba(255,251,253,0.78)",
              }}
            >
              <AccentBar />
              {children}
            </GlassView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Close pill used inside GlassDialog content (web's dialog-close recipe). */
export function DialogClosePill({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="absolute right-4 top-4 z-50 h-8 w-8 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
    >
      <Icon as={X} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

/** Web's `.eyebrow` — tiny uppercase primary label. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
      {children}
    </Text>
  );
}

/** Staggered fade-in-up for list items (web's animate-fade-in-up). */
export function FadeInUp({
  delay = 0,
  children,
}: {
  delay?: number;
  children: ReactNode;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
