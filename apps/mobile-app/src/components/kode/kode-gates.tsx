import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useRouter } from "expo-router";
import { ArrowRight, Braces, Code2, LockKeyhole, Sparkles } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { FadeInUp } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { softShadow } from "@/lib/shadow";

/** Web KodeComingSoon: shown while the deployment has Kode switched off. */
export function KodeComingSoon({ leading = "menu" }: { leading?: "menu" | "back" }) {
  const router = useRouter();
  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Kode" leading={leading} />
      <View className="flex-1 items-center justify-center px-8 pb-16">
        <FadeInUp>
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5">
              <Icon as={Code2} size={24} className="text-muted-foreground" />
            </View>
            <Text className="mt-6 text-[11px] font-semibold uppercase tracking-[3px] text-muted-foreground/70">
              Kode
            </Text>
            <Text className="mt-3 text-center text-[34px] font-semibold tracking-tight text-foreground">
              Coming soon
            </Text>
            <Text className="mt-3 max-w-xs text-center text-[14px] leading-[22px] text-muted-foreground">
              We&apos;re preparing Kode for its first production release. It will be
              available to Pro members when it launches.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/")}
              className="mt-8 h-11 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5 px-5 active:bg-foreground/10"
            >
              <Text className="text-[13.5px] font-medium text-foreground/80">Return to chat</Text>
            </Pressable>
          </View>
        </FadeInUp>
      </View>
    </SafeAreaView>
  );
}

const GATE_STATS: [string, string][] = [
  ["25K", "tokens per credit"],
  ["Live", "app preview"],
  ["Full", "source access"],
];

/** Web KodeAccessGate: Kode is a Pro workspace. */
export function KodeAccessGate({ leading = "menu" }: { leading?: "menu" | "back" }) {
  const router = useRouter();
  const { primary } = useTheme();
  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Kode" leading={leading} />
      <View className="flex-1 justify-center px-5 pb-10">
        <FadeInUp>
          <View className="items-center rounded-[28px] border border-foreground/10 bg-card px-6 py-9">
            <View
              className="h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10"
              style={{
                ...softShadow({ color: primary, opacity: 0.45, radius: 22 }),
              }}
            >
              <Icon as={LockKeyhole} size={24} className="text-primary" />
            </View>
            <View className="mt-6 flex-row items-center gap-1.5">
              <Icon as={Sparkles} size={12} className="text-primary" />
              <Text className="text-[11px] font-bold uppercase tracking-[2.5px] text-primary">
                Pro workspace
              </Text>
            </View>
            <Text className="mt-3 text-center text-[26px] font-semibold leading-8 tracking-tight text-foreground">
              Build working web apps with Kode
            </Text>
            <Text className="mt-3 text-center text-[13.5px] leading-[21px] text-muted-foreground">
              Kode turns an idea into an editable, interactive web project. It is
              available exclusively to Kontinue Pro members and includes a
              separate, token-metered monthly allowance.
            </Text>
            <View className="mt-7 flex-row gap-2">
              {GATE_STATS.map(([value, label]) => (
                <View
                  key={label}
                  className="flex-1 rounded-2xl border border-foreground/8 bg-foreground/4 p-3"
                >
                  <Text className="text-[15px] font-semibold text-foreground">{value}</Text>
                  <Text className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{label}</Text>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/pricing" as Href)}
              className="mt-7 h-12 flex-row items-center justify-center gap-2 self-stretch rounded-xl bg-primary active:opacity-90"
              style={{
                ...softShadow({ color: primary, opacity: 0.35, radius: 14, offsetY: 6 }),
              }}
            >
              <Icon as={Braces} size={16} className="text-primary-foreground" />
              <Text className="text-[14px] font-semibold text-primary-foreground">
                Upgrade to Pro
              </Text>
              <Icon as={ArrowRight} size={16} className="text-primary-foreground" />
            </Pressable>
          </View>
        </FadeInUp>
      </View>
    </SafeAreaView>
  );
}
