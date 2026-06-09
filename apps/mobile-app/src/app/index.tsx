import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/clerk-expo";
import { ArrowUpRight, X } from "lucide-react-native";

import { ChatInput } from "@/components/chat/chat-input";
import { TopToolbar } from "@/components/top-toolbar";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

const STEPS = [
  {
    title: "Start from chat input",
    description: "Type your prompt below. A new conversation opens instantly.",
  },
  {
    title: "Import when needed",
    description: "Use the import button to paste a shared link in a modal.",
  },
  {
    title: "Continue naturally",
    description: "Pick your model and keep going with full context.",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";
  const [howOpen, setHowOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <TopToolbar />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Centered hero */}
        <View className="items-center justify-center px-6" style={{ flex: 1 }}>
          <KontinueLogo height={36} />
          <Text className="mt-6 text-center text-[26px] font-normal tracking-wide text-foreground/90">
            How can I help you, {firstName}?
          </Text>

          <View className="mt-8 flex-row items-center gap-3">
            <Pressable onPress={() => setHowOpen(true)} hitSlop={6}>
              <Text className="text-[14px] text-muted-foreground underline">
                How does this work?
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setImportOpen(true)}
              className="flex-row items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2.5 active:opacity-90"
            >
              <Icon as={ArrowUpRight} size={16} className="text-primary" />
              <Text className="text-[14px] font-semibold text-foreground">
                Import shared link
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Composer pinned to the bottom */}
        <View className="px-4 pb-3">
          <ChatInput onSend={() => router.push("/chat/new")} />
        </View>
      </KeyboardAvoidingView>

      {/* "How it works" modal */}
      <SheetModal
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title="How it works"
        eyebrow="Get started"
      >
        <View className="gap-4">
          {STEPS.map((step, i) => (
            <View key={step.title} className="flex-row gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/12">
                <Text className="text-[13px] font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </Text>
              </View>
              <View className="flex-1 pt-1">
                <Text className="text-[14.5px] font-medium text-foreground">
                  {step.title}
                </Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {step.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </SheetModal>

      {/* "Import shared link" modal */}
      <SheetModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        title="Continue a conversation"
        eyebrow="Import"
      >
        <Text className="mb-4 text-[13px] leading-5 text-muted-foreground">
          Paste a shared link from ChatGPT, Claude, Gemini, or any supported
          provider. We&apos;ll bring the messages into Kontinue.
        </Text>
        <TextInput
          value={importUrl}
          onChangeText={setImportUrl}
          placeholder="https://chat.openai.com/share/..."
          placeholderTextColor="#7c6c77"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          className="rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] text-foreground"
        />
        <View className="mt-5 flex-row justify-end gap-2">
          <Pressable
            onPress={() => setImportOpen(false)}
            className="rounded-full px-4 py-2.5 active:bg-accent"
          >
            <Text className="text-[13px] font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            disabled={!importUrl.trim()}
            onPress={() => {
              setImportOpen(false);
              router.push("/chat/new");
            }}
            className={
              importUrl.trim()
                ? "rounded-full bg-primary px-4 py-2.5 active:opacity-90"
                : "rounded-full bg-primary/40 px-4 py-2.5"
            }
          >
            <Text className="text-[13px] font-semibold text-primary-foreground">
              Import chat
            </Text>
          </Pressable>
        </View>
      </SheetModal>
    </SafeAreaView>
  );
}

/** Centered glassy modal card used for the home dialogs. */
function SheetModal({
  visible,
  onClose,
  title,
  eyebrow,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 px-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover"
        >
          <View className="h-px bg-primary/50" />
          <View className="p-6">
            <View className="mb-5 flex-row items-start justify-between">
              <View>
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                  {eyebrow}
                </Text>
                <Text className="mt-1.5 text-[20px] font-semibold tracking-tight text-foreground">
                  {title}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-foreground/5 active:bg-foreground/10"
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
