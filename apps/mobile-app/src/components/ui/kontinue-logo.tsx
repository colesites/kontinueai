import { Image } from "expo-image";

import { useTheme } from "@/components/theme-provider";

const LOGO = require("@/assets/images/kontinue-logo.png");
// Source PNG is 2769 × 555 (the white "🤖 Kontinue AI" wordmark on transparent).
const RATIO = 2769 / 555;

/**
 * The Kontinue AI wordmark (robot mark + "Kontinue AI"). The asset is a white
 * silhouette, tinted to the foreground color so it reads on both schemes —
 * same behavior as the web `invert dark:invert-0` treatment.
 */
export function KontinueLogo({ height = 34 }: { height?: number }) {
  const { isDark } = useTheme();
  return (
    <Image
      source={LOGO}
      style={{ height, width: height * RATIO }}
      contentFit="contain"
      tintColor={isDark ? "#ffffff" : "#0a0a0a"}
    />
  );
}
