import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/components/theme-provider";
import { Text } from "@/components/ui/text";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { GlassView, AccentBar, FadeInUp } from "@/components/ui/glass";

/**
 * Shared premium chrome for the auth screens: a primary glow wash behind a
 * branded header sitting above a glass card with a haloed primary shadow.
 * Mirrors the home composer's glow/glass language.
 */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { isDark, primary } = useTheme();

  return (
    <View className="flex-1 bg-background">
      {/* Soft primary glow wash from the top. */}
      <LinearGradient
        colors={[`${primary}26`, `${primary}0D`, "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "55%",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-14"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FadeInUp>
            <View className="items-center gap-3 mb-7">
              <KontinueLogo height={32} />
              <View className="items-center gap-1.5">
                <Text className="text-2xl font-semibold tracking-tight text-center">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="muted" className="text-center text-[15px]">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </FadeInUp>

          <FadeInUp delay={80}>
            {/* Halo wrapper carries the primary glow shadow around the card. */}
            <View
              style={{
                borderRadius: 24,
                shadowColor: primary,
                shadowOpacity: isDark ? 0.28 : 0.18,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
              }}
            >
              <GlassView
                intensity={50}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(0,0,0,0.08)",
                  backgroundColor: isDark
                    ? "rgba(18,14,18,0.72)"
                    : "rgba(255,251,253,0.78)",
                }}
              >
                <AccentBar />
                <View className="p-6 gap-5">{children}</View>
              </GlassView>
            </View>
          </FadeInUp>

          {footer ? (
            <FadeInUp delay={140}>
              <View className="mt-6 items-center">{footer}</View>
            </FadeInUp>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
