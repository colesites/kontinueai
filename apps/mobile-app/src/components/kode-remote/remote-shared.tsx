// Kode remote control building blocks, shared by the /kode screens. Mirrors
// web features/kode-remote (RemoteBits, RemoteComposer, RemotePendingCard).

import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  buildRemoteAnswer,
  KODE_REMOTE_DEFAULT_MODE,
  KODE_REMOTE_MODES,
  KODE_REMOTE_WATCH_REFRESH_MS,
  type KodeRemoteDraftAnswer,
  type KodeRemoteMode,
  type KodeRemotePending,
  type KodeRemoteRunStatus,
} from "@repo/core/kode-remote";
import {
  ArrowUp,
  ChevronDown,
  Cpu,
  FilePen,
  Laptop,
  MessageCircleQuestion,
  Monitor,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from "lucide-react-native";

import { GlowRail } from "@/components/ui/glow-rail";
import { Dropdown, DropdownItem, useDropdown } from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";
import { softShadow } from "@/lib/shadow";

export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** Keep the chat "watched" while it's on screen, so the computer streams the reply. */
export function useWatchChat(deviceId: string, chatId: Id<"kodeChats">) {
  const watch = useMutation(api.kodeRemote.watchChat);
  useEffect(() => {
    const ping = () => {
      if (AppState.currentState !== "active") return;
      void watch({ deviceId, chatId }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, KODE_REMOTE_WATCH_REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") ping();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [watch, deviceId, chatId]);
}

export function remoteError(error: unknown, fallback: string): string {
  const data = (error as { data?: { message?: unknown } } | null)?.data;
  if (data && typeof data.message === "string") return data.message;
  return error instanceof Error ? error.message : fallback;
}

export function deviceIcon(platform: string): LucideIcon {
  return platform === "macos" ? Laptop : Monitor;
}

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <View
      className={online ? "bg-emerald-500" : "bg-muted-foreground/40"}
      style={{ width: 8, height: 8, borderRadius: 4 }}
    />
  );
}

export function RunBadge({ status }: { status: KodeRemoteRunStatus }) {
  if (status === "idle") return null;
  const awaiting = status === "awaiting";
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${awaiting ? "bg-amber-500/12" : "bg-primary/10"}`}
    >
      {awaiting ? (
        <Icon as={MessageCircleQuestion} size={11} className="text-amber-500" />
      ) : (
        <ActivityIndicator size="small" style={{ transform: [{ scale: 0.6 }] }} />
      )}
      <Text className={`text-[11px] font-medium ${awaiting ? "text-amber-500" : "text-primary"}`}>
        {awaiting ? "Needs you" : "Running"}
      </Text>
    </View>
  );
}

/** Web `surface-card`. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-border/70 bg-card ${className}`}
      style={softShadow({ color: "#000000", opacity: 0.2, radius: 2, offsetY: 1 })}
    >
      {children}
    </View>
  );
}

function PickerChip({
  icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: (event: Parameters<NonNullable<React.ComponentProps<typeof Pressable>["onPress"]>>[0]) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="max-w-[170px] flex-row items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 active:bg-foreground/10"
    >
      <Icon as={icon} size={13} className="text-muted-foreground" />
      <Text numberOfLines={1} className="shrink text-[12px] text-foreground/85">
        {label}
      </Text>
      <Icon as={ChevronDown} size={12} className="text-muted-foreground" />
    </Pressable>
  );
}

export type RemoteModel = { id: string; name: string };

/** Prompt box: text, model and permission mode (web RemoteComposer). */
export function RemoteComposer({
  models,
  defaultModelId,
  placeholder,
  disabled,
  note,
  leading,
  onSend,
}: {
  models: RemoteModel[];
  defaultModelId: string | null;
  placeholder: string;
  disabled?: boolean;
  note?: string | null;
  leading?: ReactNode;
  onSend: (input: { text: string; modelId?: string; mode: KodeRemoteMode }) => Promise<boolean>;
}) {
  const { tokens } = useTheme();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [modelId, setModelId] = useState(
    defaultModelId && models.some((m) => m.id === defaultModelId) ? defaultModelId : "",
  );
  const [mode, setMode] = useState<KodeRemoteMode>(KODE_REMOTE_DEFAULT_MODE);
  const [sending, setSending] = useState(false);
  const modelMenu = useDropdown();
  const modeMenu = useDropdown();
  const canSend = text.trim().length > 0 && !sending && !disabled;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    const ok = await onSend({ text: text.trim(), modelId: modelId || undefined, mode });
    setSending(false);
    if (ok) setText("");
  };

  const modelLabel = models.find((m) => m.id === modelId)?.name ?? "Default model";
  const modeLabel = KODE_REMOTE_MODES.find((m) => m.id === mode)?.label ?? "Supervised";

  return (
    <View>
      <View
        className="rounded-[26px] border border-foreground/8 bg-card p-2.5"
        style={softShadow({ color: "#000000", opacity: 0.25, radius: 16, offsetY: 8 })}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          multiline
          placeholder={placeholder}
          placeholderTextColor={tokens["muted-foreground"]}
          className="max-h-40 min-h-12 px-2.5 pt-1.5 text-[15px] text-foreground"
          style={{ textAlignVertical: "top" }}
        />
        <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
          {leading}
          {models.length > 0 ? <PickerChip icon={Cpu} label={modelLabel} onPress={modelMenu.open} /> : null}
          <PickerChip icon={ShieldCheck} label={modeLabel} onPress={modeMenu.open} />
          <Pressable
            accessibilityLabel="Send"
            disabled={!canSend}
            onPress={() => void submit()}
            className={`ml-auto h-9 w-9 items-center justify-center rounded-full bg-primary ${canSend ? "" : "opacity-40"}`}
          >
            {sending ? (
              <ActivityIndicator size="small" color={tokens["primary-foreground"]} />
            ) : (
              <Icon as={ArrowUp} size={17} className="text-primary-foreground" />
            )}
          </Pressable>
        </View>
        {/* The live wire rides the box's border, like web's glow-rail */}
        <GlowRail radius={26} focused={focused} />
      </View>
      {note ? <Text className="mt-2 px-2 text-[12px] leading-4 text-muted-foreground">{note}</Text> : null}

      <Dropdown visible={modelMenu.visible} anchor={modelMenu.anchor} onClose={modelMenu.close} width={240}>
        <DropdownItem
          label="Computer's default model"
          active={!modelId}
          onPress={() => {
            setModelId("");
            modelMenu.close();
          }}
        />
        {models.map((model) => (
          <DropdownItem
            key={model.id}
            label={model.name}
            active={model.id === modelId}
            onPress={() => {
              setModelId(model.id);
              modelMenu.close();
            }}
          />
        ))}
      </Dropdown>
      <Dropdown visible={modeMenu.visible} anchor={modeMenu.anchor} onClose={modeMenu.close} width={260}>
        {KODE_REMOTE_MODES.map((option) => (
          <DropdownItem
            key={option.id}
            label={`${option.label} · ${option.description}`}
            active={option.id === mode}
            onPress={() => {
              setMode(option.id);
              modeMenu.close();
            }}
          />
        ))}
      </Dropdown>
    </View>
  );
}

/** Allow/deny, or answer a question, for a run on the computer. */
export function PendingCard({
  pending,
  onApprove,
  onAnswer,
}: {
  pending: KodeRemotePending;
  onApprove: (approved: boolean) => Promise<void>;
  onAnswer: (values: string[]) => Promise<void>;
}) {
  const { tokens } = useTheme();
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<number, KodeRemoteDraftAnswer>>({});
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  if (pending.kind === "approval") {
    const isCommand = pending.title.includes("command");
    return (
      <Card className="border-amber-500/30 p-4">
        <View className="flex-row items-center gap-2">
          <Icon as={isCommand ? Terminal : FilePen} size={15} className="text-amber-500" />
          <Text className="flex-1 text-[14px] font-semibold text-foreground">{pending.title}</Text>
        </View>
        {pending.detail ? (
          <View className="mt-2.5 rounded-xl bg-foreground/5 px-3 py-2">
            <Text selectable className="font-mono text-[12px] text-foreground/90">
              {pending.detail}
            </Text>
          </View>
        ) : null}
        <View className="mt-3 flex-row gap-2">
          <Pressable
            disabled={busy}
            onPress={() => void run(() => onApprove(false))}
            className="h-11 flex-1 items-center justify-center rounded-full bg-foreground/6 active:bg-foreground/10"
          >
            <Text className="text-[14px] font-medium text-foreground">Deny</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void run(() => onApprove(true))}
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-primary active:opacity-90"
          >
            {busy ? <ActivityIndicator size="small" color={tokens["primary-foreground"]} /> : null}
            <Text className="text-[14px] font-semibold text-primary-foreground">Allow</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  const questions = pending.questions ?? [];
  const values = buildRemoteAnswer(questions, answers);
  const set = (index: number, patch: Partial<KodeRemoteDraftAnswer>) =>
    setAnswers((current) => ({ ...current, [index]: { ...(current[index] ?? { picked: [], text: "" }), ...patch } }));

  return (
    <Card className="border-primary/30 p-4">
      <View className="gap-4">
        {questions.map((question, index) => {
          const answer = answers[index] ?? { picked: [], text: "" };
          const multi = question.kind === "multi";
          const options =
            question.kind === "confirm" && question.options.length === 0
              ? [
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]
              : question.options;
          const freeText = question.kind === "text" || options.length === 0;
          return (
            <View key={`${question.question}-${index}`}>
              <View className="flex-row items-start gap-2">
                <Icon as={MessageCircleQuestion} size={15} className="mt-0.5 text-primary" />
                <Text className="flex-1 text-[14px] font-semibold leading-5 text-foreground">{question.question}</Text>
              </View>
              {!freeText ? (
                <View className="mt-2.5 flex-row flex-wrap gap-1.5">
                  {options.map((option) => {
                    const picked = answer.picked.includes(option.value);
                    return (
                      <Pressable
                        key={option.value}
                        disabled={busy}
                        onPress={() =>
                          set(index, {
                            picked: multi
                              ? picked
                                ? answer.picked.filter((v) => v !== option.value)
                                : [...answer.picked, option.value]
                              : [option.value],
                          })
                        }
                        className={`rounded-full border px-3 py-2 ${picked ? "border-primary bg-primary" : "border-foreground/10 active:bg-foreground/5"}`}
                      >
                        <Text className={`text-[13px] ${picked ? "font-medium text-primary-foreground" : "text-foreground"}`}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {freeText || question.allowOther ? (
                <TextInput
                  value={answer.text}
                  editable={!busy}
                  onChangeText={(value) => set(index, { text: value })}
                  placeholder={freeText ? (question.placeholder ?? "Your answer") : "Something else"}
                  placeholderTextColor={tokens["muted-foreground"]}
                  className="mt-2.5 h-11 rounded-full bg-foreground/5 px-4 text-[14px] text-foreground"
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <Pressable
        disabled={busy || values.length === 0}
        onPress={() => void run(() => onAnswer(values))}
        className={`mt-4 h-11 flex-row items-center justify-center gap-2 rounded-full bg-primary ${busy || values.length === 0 ? "opacity-40" : ""}`}
      >
        {busy ? <ActivityIndicator size="small" color={tokens["primary-foreground"]} /> : null}
        <Text className="text-[14px] font-semibold text-primary-foreground">Send answer</Text>
      </Pressable>
    </Card>
  );
}
