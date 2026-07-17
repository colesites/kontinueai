import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { ArrowRight, Bot, MessageSquareOff } from "lucide-react-native";

import { Markdown } from "@/components/chat/markdown";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export default function SharedConversationScreen() {
  const { primary } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const chatId = id as Id<"chats"> | undefined;
  const conversation = useQuery(
    api.chats.getSharedConversation,
    chatId ? { chatId } : "skip",
  );

  if (conversation === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={primary} />
      </SafeAreaView>
    );
  }

  if (conversation === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <Icon as={MessageSquareOff} size={21} className="text-muted-foreground" />
        </View>
        <Text className="mt-4 text-[18px] font-semibold text-foreground">
          Conversation not found
        </Text>
        <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted-foreground">
          This conversation doesn&apos;t exist or has been deleted.
        </Text>
        <Pressable
          onPress={() => router.replace("/" as Href)}
          className="mt-5 min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-5"
        >
          <Text className="font-semibold text-primary-foreground">Open Kontinue</Text>
          <Icon as={ArrowRight} size={15} className="text-primary-foreground" />
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-12 pt-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/12">
              <Icon as={Bot} size={18} className="text-primary" />
            </View>
            <Text className="text-[15px] font-semibold text-foreground">Kontinue AI</Text>
          </View>
          <Text className="mt-4 text-[10.5px] font-semibold uppercase tracking-widest text-primary">
            Shared conversation
          </Text>
          <Text className="mt-2 text-[22px] font-semibold tracking-tight text-foreground">
            {conversation.title}
          </Text>
          <Text className="mt-1.5 text-[11.5px] text-muted-foreground">
            {conversation.messages.length} message
            {conversation.messages.length === 1 ? "" : "s"} · read-only
          </Text>
        </View>

        {conversation.messages.map((message) => {
          const user = message.role === "user";
          return (
            <View
              key={message._id}
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5",
                user
                  ? "ml-auto bg-primary"
                  : "mr-auto border border-border bg-card",
              )}
            >
              {user ? (
                <Text className="text-[15px] leading-6 text-primary-foreground">
                  {message.content}
                </Text>
              ) : (
                <Markdown>{message.content}</Markdown>
              )}
            </View>
          );
        })}

        {!conversation.messages.length ? (
          <View className="items-center rounded-2xl border border-dashed border-border px-4 py-10">
            <Text className="text-[13px] text-muted-foreground">
              This conversation has no messages yet.
            </Text>
          </View>
        ) : null}

        <View className="mt-5 items-center rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <Text className="text-center text-[15px] font-semibold text-foreground">
            Continue any AI conversation
          </Text>
          <Text className="mt-1.5 text-center text-[12.5px] leading-5 text-muted-foreground">
            Import chats from ChatGPT, Claude, or Gemini and keep going with full context.
          </Text>
          <Pressable
            onPress={() => router.replace("/" as Href)}
            className="mt-4 min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-5"
          >
            <Text className="font-semibold text-primary-foreground">Try Kontinue</Text>
            <Icon as={ArrowRight} size={15} className="text-primary-foreground" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
