import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { ChevronRight, LogOut, Plug } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { ModeToggle } from "@/components/mode-toggle";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type Usage = { label: string; used: number; limit: number | null; note?: string };

const USAGE: Usage[] = [
  { label: "K-AI 1.0 Requests", used: 42, limit: 1000 },
  { label: "Free Model Messages", used: 12, limit: 30 },
  { label: "Monthly Imports", used: 3, limit: 10 },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Settings" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Account */}
        <View className="rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
              <Text className="text-lg font-bold text-primary-foreground">D</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-foreground">
                Damola Aderibigbe
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                safeflyai@gmail.com
              </Text>
            </View>
            <View className="rounded-full bg-primary/15 px-2 py-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Pro
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance */}
        <Section title="Appearance">
          <View className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <Text className="text-[14px] text-foreground">Theme</Text>
            <ModeToggle />
          </View>
        </Section>

        {/* Usage */}
        <Section title="Usage">
          <View className="gap-4 rounded-2xl border border-border bg-card p-4">
            {USAGE.map((u) => (
              <UsageBar key={u.label} {...u} />
            ))}
          </View>
        </Section>

        {/* Connectors */}
        <Section title="Account">
          <Pressable
            onPress={() => router.push("/settings")}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={Plug} size={18} className="text-muted-foreground" />
            <Text className="flex-1 text-[14px] text-foreground">Connectors</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground/50" />
          </Pressable>
          <Pressable
            onPress={() => signOut()}
            className="mt-2 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={LogOut} size={18} className="text-destructive" />
            <Text className="flex-1 text-[14px] text-destructive">Sign out</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </Text>
      {children}
    </View>
  );
}

function UsageBar({ label, used, limit }: Usage) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <View>
      <View className="mb-1.5 flex-row justify-between">
        <Text className="text-[13px] font-medium text-foreground">{label}</Text>
        <Text className="text-[13px] text-muted-foreground">
          {used} / {unlimited ? "Unlimited" : limit}
        </Text>
      </View>
      {!unlimited ? (
        <View className="h-2 overflow-hidden rounded-full bg-secondary">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </View>
      ) : null}
    </View>
  );
}
