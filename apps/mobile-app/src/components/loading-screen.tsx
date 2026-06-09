import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { useTheme } from "@/components/theme-provider";

/** Single bouncing dot with a staggered start. */
function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -7, duration: 280, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.delay(560 - delay),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, y]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: color,
        transform: [{ translateY: y }],
      }}
    />
  );
}

/** Full-screen branded loading state — Kontinue logo with bouncing dots. */
export function LoadingScreen() {
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
    </View>
  );
}
