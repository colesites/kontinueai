import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { ArrowLeft, CheckCircle2, Plug } from "lucide-react-native";
import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

import GitHubDark from "@/assets/connectors/GitHub_dark.svg";
import GitHubLight from "@/assets/connectors/GitHub_light.svg";
import VercelDark from "@/assets/connectors/Vercel_dark.svg";
import VercelLight from "@/assets/connectors/Vercel_light.svg";
import GmailLogo from "@/assets/connectors/gmail.svg";
import GoogleCalendarLogo from "@/assets/connectors/google-calendar.svg";
import GoogleDriveLogo from "@/assets/connectors/google-drive.svg";
import GoogleSheetsLogo from "@/assets/connectors/google-sheets.svg";
import NotionLogo from "@/assets/connectors/notion.svg";
import TodoistLogo from "@/assets/connectors/todoist.svg";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { API_BASE_URL } from "@/lib/chat-api";

// Mirrors apps/web connector-catalog.ts — same SVG brand marks, copied into
// assets/connectors. Themed logos (GitHub/Vercel) swap with the color scheme.
type ConnectorDef = {
  provider: string;
  name: string;
  description: string;
  logo: { kind: "single"; src: FC<SvgProps> } | { kind: "themed"; light: FC<SvgProps>; dark: FC<SvgProps> };
  available: boolean;
};

const CATALOG: ConnectorDef[] = [
  { provider: "github", name: "GitHub", description: "Read your repositories and issues in chat.", logo: { kind: "themed", light: GitHubLight, dark: GitHubDark }, available: true },
  { provider: "gmail", name: "Gmail", description: "Search and summarize your email.", logo: { kind: "single", src: GmailLogo }, available: true },
  { provider: "google_calendar", name: "Google Calendar", description: "Create events and check your schedule.", logo: { kind: "single", src: GoogleCalendarLogo }, available: true },
  { provider: "google_drive", name: "Google Drive", description: "Read and reference files from your Drive.", logo: { kind: "single", src: GoogleDriveLogo }, available: true },
  { provider: "notion", name: "Notion", description: "Search and read your Notion pages.", logo: { kind: "single", src: NotionLogo }, available: true },
  { provider: "vercel", name: "Vercel", description: "Check deployments and project status.", logo: { kind: "themed", light: VercelLight, dark: VercelDark }, available: true },
  { provider: "todoist", name: "Todoist", description: "Manage your Todoist tasks from chat.", logo: { kind: "single", src: TodoistLogo }, available: true },
  { provider: "google_sheets", name: "Google Sheets", description: "Read, create and update spreadsheets from chat.", logo: { kind: "single", src: GoogleSheetsLogo }, available: true },
];

function ConnectorLogo({ def }: { def: ConnectorDef }) {
  const { isDark } = useTheme();
  const LogoComponent =
    def.logo.kind === "single" ? def.logo.src : isDark ? def.logo.dark : def.logo.light;
  return <LogoComponent width={28} height={28} />;
}

export default function ConnectorsScreen() {
  const router = useRouter();
  const connections = useQuery(api.connectors.listConnectors, {});
  const disconnect = useMutation(api.connectors.disconnect);

  const connectionFor = (provider: string) =>
    connections?.find((c) => c.provider === provider && c.connected);

  // The OAuth grant must run in a real browser (providers block webviews),
  // against the web app which holds the client secrets. We pass our deep link
  // as return_to so the callback bounces straight back into the app, which
  // auto-dismisses the browser. Connection status lands in Convex live.
  const handleConnect = async (def: ConnectorDef) => {
    const returnTo = Linking.createURL("connectors");
    const startUrl = `${API_BASE_URL}/api/connectors/${def.provider}/start?return_to=${encodeURIComponent(returnTo)}`;
    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);
    if (result.type === "success") {
      const status = new URL(result.url).searchParams.get("status");
      if (status === "error") {
        Alert.alert(
          "Connection failed",
          `Couldn't connect ${def.name}. Please try again.`,
        );
      }
    }
  };

  const handleDisconnect = (def: ConnectorDef) => {
    Alert.alert(`Disconnect ${def.name}?`, "Kontinue will lose access until you reconnect.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          disconnect({ provider: def.provider }).catch(() =>
            Alert.alert("Couldn't disconnect", "Please try again."),
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          className="mb-6 min-h-11 self-start flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/4 px-3.5 active:bg-foreground/8"
        >
          <Icon as={ArrowLeft} size={16} className="text-muted-foreground" />
          <Text className="text-[13px] font-medium text-muted-foreground">Back to chat</Text>
        </Pressable>

        {/* Header — mirrors ConnectorsClient */}
        <Text className="text-[10.5px] font-semibold uppercase tracking-[2.5px] text-primary">Integrations</Text>
        <View className="mt-2 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/12">
            <Icon as={Plug} size={19} className="text-primary" />
          </View>
          <Text className="text-[26px] font-semibold tracking-tight text-foreground">
            Connectors
          </Text>
        </View>
        <Text className="mb-6 mt-3 text-[13.5px] leading-5 text-muted-foreground">
          Connect external services so your assistant can act on your behalf.
          Tokens are encrypted at rest and never shared.
        </Text>

        <View className="gap-3">
          {CATALOG.map((def) => {
            const connection = connectionFor(def.provider);
            const connected = !!connection;
            return (
              <View
                key={def.provider}
                className="flex-row items-center gap-4 rounded-xl border border-border/70 bg-card/60 p-4"
              >
                <ConnectorLogo def={def} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[14.5px] font-medium text-foreground">{def.name}</Text>
                    {connected && connection?.accountLabel ? (
                      <Text numberOfLines={1} className="flex-1 text-[11.5px] text-muted-foreground">
                        @{connection.accountLabel}
                      </Text>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} className="text-[11.5px] text-muted-foreground">
                    {def.description}
                  </Text>
                </View>

                {!def.available ? (
                  <View className="rounded-full bg-foreground/5 px-2.5 py-1">
                    <Text className="text-[11px] text-muted-foreground">Coming soon</Text>
                  </View>
                ) : connected ? (
                  <View className="flex-row items-center gap-2">
                    <View className="flex-row items-center gap-1">
                      <Icon as={CheckCircle2} size={13} color="#10b981" />
                      <Text className="text-[11px]" style={{ color: "#10b981" }}>
                        Connected
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDisconnect(def)}
                      className="rounded-lg border border-border/70 px-3 py-1.5 active:bg-foreground/5"
                    >
                      <Text className="text-[12px] text-muted-foreground">Disconnect</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => void handleConnect(def)}
                    className="rounded-lg bg-primary px-3 py-1.5 active:opacity-90"
                  >
                    <Text className="text-[12px] font-medium text-primary-foreground">Connect</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
