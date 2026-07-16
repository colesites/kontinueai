import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";

/** Single bouncing dot with a staggered start. */
function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(-7, { duration: 280 })),
        withTiming(0, { duration: 280 }),
        withDelay(560 - delay, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
    return () => cancelAnimation(y);
  }, [delay, y]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

/** Full-screen branded loading state — Kontinue logo with bouncing dots. */
export function LoadingScreen({
  stalled = false,
  onRecover,
}: {
  stalled?: boolean;
  onRecover?: () => void;
}) {
  const { primary } = useTheme();
  return (
    <View
      className="bg-background"
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <KontinueLogo height={34} />
      <View style={{ flexDirection: "row", gap: 7, marginTop: 24 }}>
        <Dot delay={0} color={primary} />
        <Dot delay={140} color={primary} />
        <Dot delay={280} color={primary} />
      </View>
      {stalled ? (
        <View className="mt-8 max-w-72 items-center px-5">
          <Text className="text-center text-[14px] font-medium text-foreground">
            Sign-in is taking longer than expected
          </Text>
          <Text className="mt-2 text-center text-[12px] leading-5 text-muted-foreground">
            Your session is safe. You can sign out and try again instead of
            being stuck on this screen.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRecover}
            className="mt-4 min-h-11 items-center justify-center rounded-xl border border-border bg-secondary px-5 active:bg-accent"
          >
            <Text className="text-[13px] font-semibold text-foreground">
              Sign out and recover
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
