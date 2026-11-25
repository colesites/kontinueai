// /kode/[deviceId]/[chatId]: a thread on your computer, live
// (web features/kode-remote KodeRemoteChat).

import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  deviceSeenLabel,
  isDeviceOnline,
  parseKodeRemoteMessage,
  type KodeRemoteStep,
} from "@repo/core/kode-remote";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Clock, Square, TriangleAlert, X } from "lucide-react-native";

import { Markdown } from "@/components/chat/markdown";
import {
  OnlineDot,
  PendingCard,
  RemoteComposer,
  remoteError,
  RunBadge,
  useNow,
  useWatchChat,
} from "@/components/kode-remote/remote-shared";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { goBackOr } from "@/lib/navigation";

const CONVEX_ID = /^[a-z0-9]{24,40}$/;

function StepList({ steps, live }: { steps: KodeRemoteStep[]; live?: boolean }) {
  const [open, setOpen] = useState(Boolean(live));
  if (steps.length === 0) return null;
  return (
    <View className="mb-2">
      <Pressable onPress={() => setOpen((value) => !value)} className="flex-row items-center gap-1 self-start py-1">
        <Icon as={open ? ChevronDown : ChevronRight} size={13} className="text-muted-foreground" />
        <Text className="text-[12px] text-muted-foreground">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </Text>
      </Pressable>
      {open ? (
        <View className="mt-1 gap-1 border-l border-foreground/10 pl-3">
          {steps.map((step) => (
            <View key={step.id} className="flex-row items-center gap-2">
              {step.state === "running" ? (
                <ActivityIndicator size="small" style={{ transform: [{ scale: 0.55 }], width: 12, height: 12 }} />
              ) : (
                <Icon
                  as={
                    step.state === "error" || step.state === "rejected"
                      ? X
                      : step.state.startsWith("pending")
                        ? Clock
                        : Check
                  }
                  size={12}
                  className={
                    step.state === "error" || step.state === "rejected"
                      ? "text-rose-500"
                      : step.state.startsWith("pending")
                        ? "text-amber-500"
                        : "text-emerald-500"
                  }
                />
              )}
              <Text numberOfLines={1} className="flex-1 text-[12px] text-muted-foreground">
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UserBubble({ text, waiting, onCancel }: { text: string; waiting?: boolean; onCancel?: () => void }) {
  return (
    <View className="items-end">
      <View className={`max-w-[85%] rounded-3xl bg-foreground/6 px-4 py-2.5 ${waiting ? "opacity-70" : ""}`}>
        <Text selectable className="text-[15px] leading-[21px] text-foreground">
          {text}
        </Text>
        {waiting ? (
          <View className="mt-1 flex-row items-center gap-1.5">
            <Icon as={Clock} size={11} className="text-muted-foreground" />
            <Text className="text-[11px] text-muted-foreground">Waiting for your computer</Text>
            {onCancel ? (
              <Pressable onPress={onCancel} hitSlop={8}>
                <Text className="ml-1 text-[11px] font-medium text-muted-foreground underline">Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function KodeRemoteChatScreen() {
  const params = useLocalSearchParams<{ deviceId: string; chatId: string }>();
  const deviceId = decodeURIComponent(String(params.deviceId ?? ""));
  const chatId = String(params.chatId ?? "");
  if (!CONVEX_ID.test(chatId)) return <NotFound />;
  return <RemoteChat key={chatId} deviceId={deviceId} chatId={chatId as Id<"kodeChats">} />;
}

function NotFound() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Pressable
        accessibilityLabel="Back"
        onPress={() => goBackOr(router, "/kode" as Href)}
        className="ml-2 h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
      >
        <Icon as={ArrowLeft} size={20} className="text-foreground" />
      </Pressable>
      <Text className="px-5 text-[17px] font-semibold text-foreground">Thread not found</Text>
    </SafeAreaView>
  );
}

function RemoteChat({ deviceId, chatId }: { deviceId: string; chatId: Id<"kodeChats"> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const live = useQuery(api.kodeRemote.chatLive, { deviceId, chatId });
  const overview = useQuery(api.kodeRemote.deviceOverview, { deviceId });
  const messages = useQuery(api.kode.getMessages, { chatId });
  const sendPrompt = useMutation(api.kodeRemote.sendPrompt);
  const respond = useMutation(api.kodeRemote.respond);
  const stopRun = useMutation(api.kodeRemote.stopRun);
  const cancelQueued = useMutation(api.kodeRemote.cancelQueued);
  const now = useNow(10_000);
  const scroll = useRef<ScrollView>(null);
  useWatchChat(deviceId, chatId);

  const parsed = useMemo(
    () => (messages ?? []).map((message) => ({ message, ...parseKodeRemoteMessage(message.content) })),
    [messages],
  );

  if (live === null || overview === null) return <NotFound />;

  const run = live?.run ?? null;
  const busy = run !== null && run.status !== "idle";
  const device = overview?.device;
  const online = Boolean(device?.enabled && isDeviceOnline(device.lastSeenAt, now));
  const lastSaved = messages?.at(-1)?.createdAt ?? 0;
  const showError =
    live?.lastError && live.lastError.at > lastSaved && now - live.lastError.at < 15 * 60_000;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="min-h-14 flex-row items-center gap-1 border-b border-foreground/8 px-2">
        <Pressable
          accessibilityLabel="Back to Kode"
          onPress={() => goBackOr(router, "/kode" as Href)}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
        >
          <Icon as={ArrowLeft} size={20} className="text-foreground" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">
            {live?.title ?? "Thread"}
          </Text>
          {device ? (
            <View className="flex-row items-center gap-1.5">
              <OnlineDot online={online} />
              <Text numberOfLines={1} className="text-[11.5px] text-muted-foreground">
                {device.name} · {device.enabled ? deviceSeenLabel(device.lastSeenAt, now) : "remote control off"}
              </Text>
            </View>
          ) : null}
        </View>
        {busy ? (
          <>
            <RunBadge status={run.status} />
            <Pressable
              accessibilityLabel="Stop"
              onPress={() =>
                void stopRun({ deviceId, chatId }).catch((error) =>
                  toast.error("Couldn't stop it", { description: remoteError(error, "Please try again.") }),
                )
              }
              className="ml-1 h-9 flex-row items-center gap-1.5 rounded-full bg-foreground/6 px-3 active:bg-foreground/10"
            >
              <Icon as={Square} size={11} className="text-foreground" fill="currentColor" />
              <Text className="text-[12.5px] font-medium text-foreground">Stop</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerClassName="gap-5 px-4 pt-4 pb-6"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {messages === undefined || live === undefined ? (
            <View className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : null}
          {parsed.map(({ message, text, steps }) =>
            message.role === "user" ? (
              <UserBubble key={message._id} text={text} />
            ) : message.role === "assistant" ? (
              <View key={message._id}>
                <StepList steps={steps} />
                {text ? <Markdown>{text}</Markdown> : null}
              </View>
            ) : null,
          )}

          {live?.queued.map((item) => (
            <UserBubble
              key={item.id}
              text={item.text}
              waiting
              onCancel={() => void cancelQueued({ commandId: item.id })}
            />
          ))}

          {busy ? (
            <View>
              <StepList steps={run.steps} live />
              {run.text ? (
                <Markdown>{run.text}</Markdown>
              ) : (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" />
                  <Text className="text-[14px] text-muted-foreground">
                    {run.steps.at(-1)?.label ?? "Working on your computer…"}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {run?.pending.map((pending) => (
            <PendingCard
              key={pending.id}
              pending={pending}
              onApprove={async (approved) => {
                try {
                  await respond({ deviceId, chatId, stepId: pending.id, approved });
                } catch (error) {
                  toast.error("Couldn't send that", { description: remoteError(error, "Please try again.") });
                }
              }}
              onAnswer={async (values) => {
                try {
                  await respond({ deviceId, chatId, stepId: pending.id, values });
                } catch (error) {
                  toast.error("Couldn't send that", { description: remoteError(error, "Please try again.") });
                }
              }}
            />
          ))}

          {showError ? (
            <View className="flex-row items-start gap-2 rounded-2xl bg-rose-500/8 px-4 py-3">
              <Icon as={TriangleAlert} size={14} className="mt-0.5 text-rose-500" />
              <Text className="flex-1 text-[12.5px] leading-4 text-rose-500">{live?.lastError?.message}</Text>
            </View>
          ) : null}
        </ScrollView>

        {device ? (
          <View className="px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
            <RemoteComposer
              models={device.models}
              defaultModelId={device.defaultModelId}
              disabled={!device.enabled}
              placeholder={busy ? "Send a follow-up…" : "Reply to Kode…"}
              note={
                !device.enabled
                  ? "Remote control is off on this computer."
                  : online
                    ? null
                    : "This computer looks offline. Your message waits up to 10 minutes for it."
              }
              onSend={async ({ text, modelId, mode }) => {
                try {
                  await sendPrompt({ deviceId, chatId, text, modelId, mode });
                  return true;
                } catch (error) {
                  toast.error("Couldn't send it", { description: remoteError(error, "Please try again.") });
                  return false;
                }
              }}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
