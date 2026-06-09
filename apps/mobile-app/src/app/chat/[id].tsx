import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChatInput } from "@/components/chat/chat-input";
import { ScreenHeader } from "@/components/screen-header";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; text: string };

const MESSAGES: Message[] = [
  { id: "1", role: "user", text: "Plan the auth flow for a notes app." },
  {
    id: "2",
    role: "assistant",
    text: "Here's a plan:\n\n1. Email + password via Clerk\n2. Protected routes with middleware\n3. Session in Convex\n\nWant me to scaffold it?",
  },
];

export default function ConversationScreen() {
  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Plan the auth flow" leading="back" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerClassName="px-4 py-3 gap-3"
          showsVerticalScrollIndicator={false}
        >
          {MESSAGES.map((m) => (
            <View
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                m.role === "user"
                  ? "self-end bg-primary"
                  : "self-start border border-border bg-card",
              )}
            >
              <Text
                className={cn(
                  "text-[15px] leading-6",
                  m.role === "user"
                    ? "text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {m.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View className="px-3 pb-2 pt-1">
          <ChatInput placeholder="Reply…" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
