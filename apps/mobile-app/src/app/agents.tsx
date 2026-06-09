import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bot,
  CalendarCheck,
  Code2,
  Megaphone,
  Telescope,
  type LucideIcon,
} from "lucide-react-native";
import { AGENTS } from "@repo/ai/lib/agents";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const ICONS: Record<string, LucideIcon> = {
  Telescope,
  Code2,
  Megaphone,
  CalendarCheck,
  Bot,
};

export default function AgentsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Agents" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 gap-3"
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-1 text-[14px] text-muted-foreground">
          Specialized agents that share your memory, projects and tasks.
        </Text>

        {AGENTS.map((agent) => {
          const AgentIcon = ICONS[agent.icon] ?? Bot;
          return (
            <View
              key={agent.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <View className="flex-row items-start gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${agent.color}22` }}
                >
                  <Icon as={AgentIcon} size={20} color={agent.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold text-foreground">
                    {agent.name}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-muted-foreground">
                    {agent.description}
                  </Text>
                </View>
              </View>

              {/* Capabilities */}
              <View className="mt-3 flex-row flex-wrap gap-1.5">
                {agent.capabilities.slice(0, 4).map((cap) => (
                  <View
                    key={cap}
                    className="rounded-full bg-secondary px-2.5 py-1"
                  >
                    <Text className="text-[11.5px] text-secondary-foreground">
                      {cap}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Suggested actions */}
              <View className="mt-3 gap-1.5">
                {agent.suggestedActions.slice(0, 2).map((action) => (
                  <Pressable
                    key={action}
                    onPress={() => router.push(`/chat/new?agent=${agent.id}`)}
                    className="rounded-lg bg-secondary/60 px-3 py-2.5 active:opacity-80"
                  >
                    <Text className="text-[12.5px] text-muted-foreground">
                      {action}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => router.push(`/chat/new?agent=${agent.id}`)}
                className="mt-3 h-11 items-center justify-center rounded-xl bg-primary active:opacity-90"
              >
                <Text className="text-[14px] font-semibold text-primary-foreground">
                  Chat with {agent.name}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
