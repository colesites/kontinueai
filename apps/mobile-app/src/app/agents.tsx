import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Code2,
  Megaphone,
  Telescope,
  type LucideIcon,
} from "lucide-react-native";
import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";

import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { savePendingChatDraft } from "@/lib/pending-chat-draft";

const ICONS: Record<string, LucideIcon> = {
  Telescope,
  Code2,
  Megaphone,
  CalendarCheck,
  Bot,
};

export default function AgentsScreen() {
  const { primary } = useTheme();
  const router = useRouter();
  const createChat = useMutation(api.chats.createChat);
  const [startingAgentId, setStartingAgentId] = useState<string | null>(null);

  // Starts a real chat with the agent persona (mirrors AgentsClient).
  const startAgentChat = async (agent: AgentDefinition, prompt?: string) => {
    if (startingAgentId) return;
    setStartingAgentId(agent.id);
    try {
      const chatId = await createChat({
        title: prompt?.trim().slice(0, 60) || agent.name,
        provider: "unknown",
        importMethod: "manual",
        messages: [],
      });
      if (prompt?.trim()) {
        savePendingChatDraft(String(chatId), { text: prompt });
      }
      router.push(`/chat/${chatId}?agent=${agent.id}`);
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      Alert.alert(
        "Couldn't start chat",
        data?.message ?? (err instanceof Error ? err.message : "Please try again."),
      );
    } finally {
      setStartingAgentId(null);
    }
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — mirrors AgentsClient */}
        <View className="mb-8">
          <Text className="text-[10.5px] font-semibold uppercase tracking-[2.5px] text-primary">Agents</Text>
          <View className="mt-2 flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/12"
              style={{ boxShadow: `0 4px 10px ${primary}59` }}
            >
              <Icon as={Bot} size={18} className="text-primary" />
            </View>
            <Text className="text-[27px] font-semibold tracking-tight text-foreground">
              Agents
            </Text>
          </View>
          <Text className="mt-3 text-[13.5px] leading-5 text-muted-foreground">
            Specialized AI agents that share your memory, projects, and tasks.
            Pick one to start a focused conversation.
          </Text>
        </View>

        <View className="gap-4">
          {AGENTS.map((agent) => {
            const AgentIcon = ICONS[agent.icon] ?? Bot;
            const starting = startingAgentId === agent.id;
            return (
              <View
                key={agent.id}
                className="rounded-2xl border border-foreground/8 bg-foreground/2 p-5"
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className="h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${agent.color}1a` }}
                  >
                    <Icon as={AgentIcon} size={20} color={agent.color} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15.5px] font-semibold leading-tight text-foreground">
                      {agent.name}
                    </Text>
                    <Text className="mt-0.5 text-[13px] leading-4 text-muted-foreground">
                      {agent.description}
                    </Text>
                  </View>
                </View>

                {/* All capabilities, like web */}
                <View className="mt-4 flex-row flex-wrap gap-1.5">
                  {agent.capabilities.map((cap) => (
                    <View key={cap} className="rounded-full bg-foreground/5 px-2.5 py-1">
                      <Text className="text-[11.5px] text-muted-foreground">{cap}</Text>
                    </View>
                  ))}
                </View>

                {/* Three suggested actions with trailing arrows */}
                <View className="mt-4 gap-1.5">
                  {agent.suggestedActions.slice(0, 3).map((action) => (
                    <Pressable
                      key={action}
                      disabled={starting}
                      onPress={() => void startAgentChat(agent, action)}
                      className="flex-row items-center justify-between gap-2 rounded-lg bg-foreground/3 px-3 py-2 active:bg-foreground/6"
                    >
                      <Text numberOfLines={1} className="flex-1 text-[12.5px] text-muted-foreground">
                        {action}
                      </Text>
                      <Icon as={ArrowRight} size={13} className="text-muted-foreground/50" />
                    </Pressable>
                  ))}
                </View>

                <Pressable
                  disabled={starting}
                  onPress={() => void startAgentChat(agent)}
                  style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}
                  className={
                    starting
                      ? "mt-4 items-center justify-center rounded-xl bg-primary/60 px-4 py-2.5"
                      : "mt-4 items-center justify-center rounded-xl bg-primary px-4 py-2.5"
                  }
                >
                  <Text className="text-[13px] font-semibold text-primary-foreground">
                    {starting ? "Starting…" : `Chat with ${agent.name}`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
