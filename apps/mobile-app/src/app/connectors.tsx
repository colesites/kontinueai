import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { goBackOr } from "@/lib/navigation";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { ArrowLeft, CheckCircle2, Plug } from "lucide-react-native";

import {
  CONNECTOR_CATALOG,
  ConnectorLogo,
  type ConnectorDef,
} from "@/components/connectors/catalog";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/app-errors";
import { API_BASE_URL } from "@/lib/chat-api";
import { softShadow } from "@/lib/shadow";

export default function ConnectorsScreen() {
  const router = useRouter();
  const connections = useQuery(api.connectors.listConnectors, {});
  const disconnect = useMutation(api.connectors.disconnect);

  const connectionFor = (provider: string) =>
    connections?.find((c) => c.provider === provider && c.connected);

  const { getToken } = useAuth();
  const { primary, primaryForeground } = useTheme();
  const [connecting, setConnecting] = useState<string | null>(null);

  // The OAuth grant must run in a real browser (providers block webviews),
  // against the web app which holds the client secrets. That browser usually
  // has no Kontinue session, so web mints a one-time sign-in ticket for this
  // user (/api/connectors/mobile-handoff) and /connect/mobile redeems it before
  // the normal start route. return_to brings the browser back into the app.
  const handleConnect = async (def: ConnectorDef) => {
    if (connecting) return;
    setConnecting(def.provider);
    // Always the app scheme: the web routes only honour mobileapp:// returns
    // (Expo Go's exp:// links would be dropped).
    const returnTo = Linking.createURL("connectors", { scheme: "mobileapp" });
    try {
      const token = await getToken();
      let startUrl = `${API_BASE_URL}/api/connectors/${def.provider}/start?return_to=${encodeURIComponent(returnTo)}`;
      const handoff = await fetch(`${API_BASE_URL}/api/connectors/mobile-handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider: def.provider, returnTo }),
      });
      if (handoff.ok) {
        const body = (await handoff.json()) as { url?: string };
        if (body.url) startUrl = body.url;
      } else if (handoff.status !== 404) {
        throw new Error("Couldn't start the connection. Please try again.");
      }
      // A 404 means an older server without the handoff: fall back to the
      // direct start route (works when the browser already has a session).
      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnTo);
      if (result.type === "success") {
        const status = new URL(result.url).searchParams.get("status");
        if (status === "error") {
          toast.error("Connection failed", {
            description: `Couldn't connect ${def.name}. Please try again.`,
          });
        } else if (status === "connected") {
          toast.success(`${def.name} connected`);
        }
      }
    } catch (error) {
      toast.error("Connection failed", {
        description: errorMessage(error, `Couldn't connect ${def.name}.`),
      });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = (def: ConnectorDef) => {
    Alert.alert(`Disconnect ${def.name}?`, "Kontinue will lose access until you reconnect.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          disconnect({ provider: def.provider })
            .then(() => toast.success(`${def.name} disconnected`))
            .catch((error) =>
              toast.error("Couldn't disconnect", {
                description: errorMessage(error, "Please try again."),
              }),
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
          onPress={() => goBackOr(router, "/")}
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
          {CONNECTOR_CATALOG.map((def) => {
            const connection = connectionFor(def.provider);
            const connected = !!connection;
            return (
              <View
                key={def.provider}
                className="flex-row items-center gap-3.5 rounded-2xl border border-foreground/8 bg-card p-4"
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
                      <Icon as={CheckCircle2} size={13} className="text-primary" />
                      <Text className="text-[11px] font-medium text-primary">
                        Connected
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDisconnect(def)}
                      className="rounded-full border border-foreground/8 bg-foreground/4 px-3 py-1.5 active:bg-foreground/8"
                    >
                      <Text className="text-[12px] text-muted-foreground">Disconnect</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Connect ${def.name}`}
                    disabled={connecting !== null}
                    onPress={() => void handleConnect(def)}
                    className="min-w-20 items-center rounded-full bg-primary px-3.5 py-1.5 active:opacity-90"
                    style={{
                      ...softShadow({ color: primary, opacity: 0.3, radius: 8, offsetY: 3 }),
                      opacity: connecting && connecting !== def.provider ? 0.5 : 1,
                    }}
                  >
                    {connecting === def.provider ? (
                      <ActivityIndicator size="small" color={primaryForeground} />
                    ) : (
                      <Text className="text-[12px] font-semibold text-primary-foreground">Connect</Text>
                    )}
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
