import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRouter, type Href } from "expo-router";
import { useClerk, useUser } from "@clerk/expo";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { planLabel } from "@repo/core/plan-tier";
import {
  SPEECH_LANGUAGE_OPTIONS,
  type SpeechLanguageOption,
} from "@repo/core/speech-settings";
import {
  formatBytes,
  memoryTypeLabel,
  type MemoryType,
} from "@repo/core/memory";
import {
  ArrowLeft,
  ChevronRight,
  Check,
  Copy,
  Download,
  FileArchive,
  FileJson,
  FileText,
  LogOut,
  Mail,
  MessageSquare,
  Pin,
  PinOff,
  Plug,
  Search,
  Sparkles,
  UserPlus,
  Trash2,
  Upload,
} from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { API_BASE_URL } from "@/lib/chat-api";
import { ModeToggle } from "@/components/mode-toggle";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";
import { getDisplayName, getInitial } from "@/lib/user-display";
import {
  getMobileSpeechLanguage,
  setMobileSpeechLanguage,
} from "@/lib/speech-settings";

type SettingsTab = "account" | "invite" | "memory" | "data" | "contact";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "invite", label: "Invite" },
  { id: "memory", label: "Memory" },
  { id: "data", label: "Data" },
  { id: "contact", label: "Contact" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const planTier = usePlanTier();
  const [tab, setTab] = useState<SettingsTab>("account");

  const displayName = getDisplayName(user, "Account");
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = getInitial(user);

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <View className="flex-row items-center justify-between gap-2 px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="min-h-11 flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/4 px-3.5 active:bg-foreground/8"
        >
          <Icon as={ArrowLeft} size={16} className="text-muted-foreground" />
          <Text className="text-[13px] font-medium text-muted-foreground">Back to chat</Text>
        </Pressable>
        <View className="flex-row items-center gap-1">
          <ModeToggle />
          <Pressable
            onPress={() => void signOut()}
            className="min-h-11 flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/4 px-3.5 active:bg-destructive/10"
          >
            <Icon as={LogOut} size={15} className="text-destructive" />
            <Text className="text-[13px] font-medium text-destructive">Sign out</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 gap-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="pb-1 pt-2">
          <Text className="text-[10.5px] font-semibold uppercase tracking-[2.5px] text-primary">Settings</Text>
          <Text className="mt-2 text-[26px] font-semibold tracking-tight text-foreground">Your account</Text>
          <Text className="mt-1.5 text-[13.5px] text-muted-foreground">Manage your profile, usage, memory, and data.</Text>
        </View>

        {/* Profile card */}
        <View className="relative flex-row items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card px-4 py-5">
          <View className="absolute -top-10 left-0 right-0 h-24 bg-primary/8" />
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{ width: 64, height: 64, borderRadius: 32 }}
            />
          ) : (
            <View
              className="items-center justify-center rounded-full border border-primary/25 bg-primary/15"
              style={{ width: 64, height: 64 }}
            >
              <Text className="text-[23px] font-semibold text-primary">
                {initial}
              </Text>
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[18px] font-semibold tracking-tight text-foreground">
              {displayName}
            </Text>
            <Text numberOfLines={1} className="mt-1 text-[13px] text-muted-foreground">
              {email}
            </Text>
            <View className="mt-3 self-start flex-row items-center gap-1.5 rounded-full border border-primary/20 bg-primary/12 px-2.5 py-1">
              {planTier !== "free" ? <Icon as={Sparkles} size={11} className="text-primary" /> : null}
              <Text className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">
                {planLabel(planTier)} Plan
              </Text>
            </View>
          </View>
        </View>

        {/* Current plan */}
        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-[15px] font-semibold text-foreground">
            Current plan
          </Text>
          <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
            {planTier === "max"
              ? "You have our highest limits, full Kode, Canvas, and 120 minutes of Live."
              : planTier === "pro"
                ? "You have Frontier models, Kode Lite, Canvas, and Kontinue Live."
                : planTier === "plus"
                  ? "You have the wider Basic and Pro model catalogue."
                  : planTier === "starter"
                    ? "You have three fast Basic models and higher everyday limits."
                    : "You are on Free with K-AI and clear monthly limits."}
          </Text>
          <Pressable
            onPress={() => router.push("/pricing" as Href)}
            className="mt-3 self-start rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 active:opacity-80"
          >
            <Text className="text-[13px] font-semibold text-primary">
              {planTier === "max" ? "View plans" : "Upgrade plan"}
            </Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 rounded-xl bg-secondary p-1"
        >
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.id }}
              onPress={() => setTab(t.id)}
              className={cn(
                "min-h-11 min-w-20 items-center justify-center rounded-lg px-3",
                tab === t.id && "bg-background",
              )}
            >
              <Text
                className={cn(
                  "text-[13px] font-medium",
                  tab === t.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === "account" ? <AccountPanel /> : null}
        {tab === "invite" ? <InvitePanel /> : null}
        {tab === "memory" ? <MemoryPanel /> : null}
        {tab === "data" ? <DataPanel /> : null}
        {tab === "contact" ? (
          <ContactPanel onFeedback={() => router.push("/feedback" as Href)} />
        ) : null}

        {/* Footer actions */}
        <View>
          <Pressable
            onPress={() => router.push("/connectors" as Href)}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={Plug} size={18} className="text-muted-foreground" />
            <Text className="flex-1 text-[14px] text-foreground">
              Connectors
            </Text>
            <Icon
              as={ChevronRight}
              size={18}
              className="text-muted-foreground/50"
            />
          </Pressable>
          {planTier === "free" ? (
            <Pressable
              onPress={() => router.push("/pricing" as Href)}
              className="mt-2 flex-row items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5 active:opacity-80"
            >
              <Icon as={Sparkles} size={18} className="text-primary" />
              <Text className="flex-1 text-[14px] font-medium text-primary">
                Upgrade
              </Text>
              <Icon as={ChevronRight} size={18} className="text-primary/60" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void signOut()}
            className="mt-2 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={LogOut} size={18} className="text-destructive" />
            <Text className="flex-1 text-[14px] text-destructive">
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Account: usage ───────────────────────────────────────────────────────────

function AccountPanel() {
  const usage = useQuery(api.messages.getMonthlyUsage, {});
  const aiUsage = useQuery(api.aiUsage.getUsage, {});
  const [language, setLanguage] = useState("auto");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);

  useEffect(() => {
    void getMobileSpeechLanguage().then(setLanguage);
  }, []);

  const selectedLanguage = useMemo(
    () => SPEECH_LANGUAGE_OPTIONS.find((option) => option.value === language),
    [language],
  );

  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">Usage</Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Track shared AI credits, requests, and imports.
        </Text>
      </View>
      <View className="gap-5 rounded-2xl border border-border bg-card p-4">
        {usage === undefined || aiUsage === undefined ? (
          <View className="gap-3">
            {[1, 2, 3].map((i) => (
              <View key={i} className="h-8 rounded-lg bg-foreground/5" />
            ))}
          </View>
        ) : usage === null ? (
          <Text className="text-[13px] text-muted-foreground">
            Usage will appear once you start chatting.
          </Text>
        ) : (
          <>
            <UsageBar
              label="AI usage credits"
              used={aiUsage.used}
              limit={aiUsage.limit}
              note={`${aiUsage.remaining.toLocaleString()} credits remain across chat, search, media, Live, Canvas AI actions, and Kode AI runs.`}
            />
            <UsageBar
              label="K-AI 1.0 Requests"
              used={usage.kaiUsed}
              limit={usage.kaiLimit}
              note="K-AI 1.0 has its own monthly request budget, separate from other models. Resets at the start of each UTC month."
            />
            {usage.isPaid ? (
              <>
                <UsageBar
                  label="Premium Model Messages"
                  used={usage.paidPremiumUsed}
                  limit={usage.paidPremiumLimit}
                />
                <UsageBar
                  label="Standard Model Messages"
                  used={usage.paidStandardUsed}
                  limit={usage.paidStandardLimit}
                />
              </>
            ) : (
              <UsageBar
                label="Free Model Messages"
                used={usage.freeMonthlyUsed}
                limit={usage.freeMonthlyLimit}
                note="Upgrade to Starter or Pro for higher limits and premium models."
              />
            )}
            <UsageBar
              label="Monthly Imports"
              used={usage.monthlyImportUsed}
              limit={usage.monthlyImportLimit}
              note="Monthly import limits reset at the start of each UTC month."
            />
          </>
        )}
      </View>

      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">
          Voice input language
        </Text>
        <Text className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
          Choose the recognition language used by the microphone in chat.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setLanguagePickerOpen(true)}
          className="mt-3 min-h-12 flex-row items-center rounded-xl border border-border bg-secondary px-3.5 active:bg-accent"
        >
          <Text
            numberOfLines={1}
            className="flex-1 text-[13.5px] text-foreground"
          >
            {selectedLanguage?.label ?? "Auto detect (Recommended)"}
          </Text>
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </Pressable>
      </View>

      <SpeechLanguagePicker
        visible={languagePickerOpen}
        selected={language}
        onClose={() => setLanguagePickerOpen(false)}
        onSelect={(value) => {
          void setMobileSpeechLanguage(value)
            .then(setLanguage)
            .catch(() =>
              Alert.alert("Couldn't save language", "Please try again."),
            );
          setLanguagePickerOpen(false);
        }}
      />
    </View>
  );
}

function SpeechLanguagePicker({
  visible,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const { mutedForeground } = useTheme();
  const [search, setSearch] = useState("");
  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return SPEECH_LANGUAGE_OPTIONS;
    return SPEECH_LANGUAGE_OPTIONS.filter((option) =>
      `${option.label} ${option.nativeLabel ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  const renderOption = useCallback(
    ({ item }: { item: SpeechLanguageOption }) => (
      <SpeechLanguageRow
        option={item}
        selected={selected === item.value}
        onSelect={onSelect}
      />
    ),
    [onSelect, selected],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/55">
        <View className="max-h-[85%] rounded-t-3xl border-t border-border bg-background px-4 pb-8 pt-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[18px] font-semibold text-foreground">
              Voice language
            </Text>
            <Pressable
              onPress={onClose}
              className="min-h-11 justify-center px-2"
            >
              <Text className="text-[13px] font-semibold text-primary">
                Done
              </Text>
            </Pressable>
          </View>
          <View className="mb-3 min-h-11 flex-row items-center rounded-xl border border-border bg-secondary px-3">
            <Icon as={Search} size={15} className="text-muted-foreground" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search languages"
              placeholderTextColor={mutedForeground}
              className="ml-2 flex-1 text-[14px] text-foreground"
            />
          </View>
          <FlatList
            data={options}
            keyExtractor={(option) => option.value}
            showsVerticalScrollIndicator={false}
            renderItem={renderOption}
          />
        </View>
      </View>
    </Modal>
  );
}

function SpeechLanguageRow({
  option,
  selected,
  onSelect,
}: {
  option: SpeechLanguageOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  const handlePress = useCallback(
    () => onSelect(option.value),
    [onSelect, option.value],
  );

  return (
    <Pressable
      onPress={handlePress}
      className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 active:bg-accent"
    >
      <View className="flex-1">
        <Text className="text-[13.5px] text-foreground">{option.label}</Text>
        {option.nativeLabel ? (
          <Text className="mt-0.5 text-[11px] text-muted-foreground">
            {option.nativeLabel}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon as={Check} size={17} className="text-primary" /> : null}
    </Pressable>
  );
}

function InvitePanel() {
  const { primaryForeground } = useTheme();
  const summary = useQuery(api.referrals.getReferralSummary, {});
  const ensureCode = useMutation(api.referrals.ensureReferralCode);
  const [creating, setCreating] = useState(false);
  const code = summary?.code ?? null;
  const inviteUrl = code ? `${API_BASE_URL}/invite/${code}` : null;

  const createCode = async () => {
    setCreating(true);
    try {
      await ensureCode({});
    } catch (error) {
      Alert.alert(
        "Couldn't create invite",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    Alert.alert(
      "Invite copied",
      "Share it with someone you want to bring to Kontinue.",
    );
  };

  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">
          Invite friends
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Share Kontinue and track successful invites and bonus credits.
        </Text>
      </View>
      <View className="rounded-2xl border border-border bg-card p-4">
        {summary === undefined ? (
          <ActivityIndicator size="small" />
        ) : inviteUrl ? (
          <>
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Your invite link
            </Text>
            <View className="mt-3 rounded-xl border border-border bg-secondary p-3">
              <Text
                selectable
                numberOfLines={2}
                className="text-[12.5px] leading-5 text-foreground"
              >
                {inviteUrl}
              </Text>
            </View>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => void copyInvite()}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border active:bg-accent"
              >
                <Icon as={Copy} size={15} className="text-foreground" />
                <Text className="text-[13px] font-medium text-foreground">
                  Copy
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void Share.share({ message: inviteUrl })}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary active:opacity-90"
              >
                <Icon
                  as={UserPlus}
                  size={15}
                  className="text-primary-foreground"
                />
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  Share
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            disabled={creating}
            onPress={() => void createCode()}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary active:opacity-90"
          >
            {creating ? (
              <ActivityIndicator size="small" color={primaryForeground} />
            ) : (
              <Icon
                as={UserPlus}
                size={17}
                className="text-primary-foreground"
              />
            )}
            <Text className="text-[13.5px] font-semibold text-primary-foreground">
              {creating ? "Creating…" : "Create invite link"}
            </Text>
          </Pressable>
        )}
      </View>
      {summary ? (
        <View className="flex-row gap-2">
          <InviteStat label="Invited" value={summary.invitedCount} />
          <InviteStat label="Converted" value={summary.convertedCount} />
          <InviteStat label="Bonus left" value={summary.bonusRemaining} />
        </View>
      ) : null}
    </View>
  );
}

function InviteStat({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card px-2 py-4">
      <Text className="text-center text-[18px] font-semibold text-foreground">
        {value}
      </Text>
      <Text className="mt-1 text-center text-[10.5px] text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

function ContactPanel({ onFeedback }: { onFeedback: () => void }) {
  const router = useRouter();
  const actions = [
    { label: "Send feedback", icon: MessageSquare, onPress: onFeedback },
    {
      label: "Email support",
      icon: Mail,
      onPress: () => void Linking.openURL("mailto:support@kontinueai.com"),
    },
    {
      label: "Privacy policy",
      icon: FileText,
      onPress: () => router.push("/legal/privacy" as Href),
    },
    {
      label: "Terms of service",
      icon: FileText,
      onPress: () => router.push("/legal/terms" as Href),
    },
  ];
  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">
          Contact & legal
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Get help, shape the product, and review policy information.
        </Text>
      </View>
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {actions.map((action, index) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            className={cn(
              "min-h-14 flex-row items-center gap-3 px-4 active:bg-accent",
              index > 0 && "border-t border-border",
            )}
          >
            <Icon
              as={action.icon}
              size={17}
              className="text-muted-foreground"
            />
            <Text className="flex-1 text-[13.5px] text-foreground">
              {action.label}
            </Text>
            <Icon
              as={ChevronRight}
              size={16}
              className="text-muted-foreground/60"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Memory ───────────────────────────────────────────────────────────────────

function MemoryPanel() {
  const { mutedForeground, primaryForeground } = useTheme();
  const [search, setSearch] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualType, setManualType] = useState<MemoryType>("context");
  const [saving, setSaving] = useState(false);

  const memoryStatus = useQuery(api.memories.getMemoryStatus, {});
  const memoryTypes = useQuery(api.memories.getMemoryTypes, {});
  const memories = useQuery(api.memories.listDashboardMemories, {
    search: search.trim() ? search : undefined,
    limit: 60,
  });
  const pinMemory = useMutation(api.memories.pinMemory);
  const deleteMemory = useMutation(api.memories.deleteMemory);
  const createManualMemory = useAction(api.memoryWorkers.createManualMemory);

  const handleSave = async () => {
    const content = manualContent.trim();
    if (content.length < 8 || saving) return;
    setSaving(true);
    try {
      await createManualMemory({ type: manualType, content, pinned: true });
      setManualContent("");
    } catch (err) {
      Alert.alert(
        "Couldn't save memory",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (memoryId: Id<"memories">) => {
    Alert.alert("Delete memory?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteMemory({ memoryId }).catch(() =>
            Alert.alert("Couldn't delete memory", "Please try again."),
          );
        },
      },
    ]);
  };

  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">
          Memory
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Review what Kontinue AI keeps, pin important context, and free up
          space when storage reaches your plan limit.
        </Text>
      </View>

      {/* Quota */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-start justify-between">
          <Text className="text-[14px] font-medium text-foreground">
            Memory Usage
          </Text>
          {memoryStatus ? (
            <View className="items-end">
              <Text className="text-[13px] font-medium text-foreground">
                {memoryStatus.usedBytesLabel} / {memoryStatus.limitBytesLabel}
              </Text>
              <Text className="text-[11px] text-muted-foreground">
                {memoryStatus.memoryCount} memories, {memoryStatus.summaryCount}{" "}
                summaries
              </Text>
            </View>
          ) : null}
        </View>
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <View
            className="h-full rounded-full bg-primary"
            style={{
              width: `${Math.min(100, memoryStatus?.usagePercent ?? 0)}%`,
            }}
          />
        </View>
        {memoryStatus?.warning ? (
          <Text className="mt-2 text-[12px] text-amber-500">
            {memoryStatus.warning}
          </Text>
        ) : null}
      </View>

      {/* Manual save */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">
          Save Memory Manually
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1.5 py-3"
        >
          {(memoryTypes ?? []).map((type) => (
            <Pressable
              key={type}
              onPress={() => setManualType(type)}
              className={cn(
                "rounded-full border px-3 py-1.5",
                manualType === type
                  ? "border-primary/50 bg-primary/15"
                  : "border-border bg-secondary",
              )}
            >
              <Text
                className={cn(
                  "text-[12px] font-medium",
                  manualType === type
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {memoryTypeLabel(type)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          value={manualContent}
          onChangeText={setManualContent}
          multiline
          placeholder="Example: My startup is Kontinue AI and I want the assistant to remember that."
          placeholderTextColor={mutedForeground}
          className="min-h-20 rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] text-foreground"
        />
        <Pressable
          disabled={manualContent.trim().length < 8 || saving}
          onPress={() => void handleSave()}
          className={cn(
            "mt-3 h-10 items-center justify-center rounded-xl",
            manualContent.trim().length >= 8 && !saving
              ? "bg-primary active:opacity-90"
              : "bg-primary/40",
          )}
        >
          {saving ? (
            <ActivityIndicator size="small" color={primaryForeground} />
          ) : (
            <Text className="text-[13.5px] font-semibold text-primary-foreground">
              Save memory
            </Text>
          )}
        </Pressable>
      </View>

      {/* Search + list */}
      <View className="h-11 flex-row items-center gap-2 rounded-xl border border-border bg-secondary px-3">
        <Icon as={Search} size={16} className="text-muted-foreground" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search memories…"
          placeholderTextColor={mutedForeground}
          className="flex-1 text-[14px] text-foreground"
        />
      </View>

      {memories === undefined ? (
        <View className="gap-2">
          {[1, 2, 3].map((i) => (
            <View key={i} className="h-16 rounded-xl bg-foreground/5" />
          ))}
        </View>
      ) : memories.length === 0 ? (
        <View className="items-center rounded-2xl border border-dashed border-border px-4 py-8">
          <Text className="text-center text-[13px] text-muted-foreground">
            {search
              ? "No memories match your search."
              : "No memories yet — they build up as you chat."}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {memories.map((memory) => (
            <View
              key={memory._id}
              className="rounded-2xl border border-border bg-card p-3.5"
            >
              <View className="flex-row items-center gap-2">
                <View className="rounded-full bg-secondary px-2 py-0.5">
                  <Text className="text-[10.5px] font-medium text-muted-foreground">
                    {memoryTypeLabel(memory.type as MemoryType)}
                  </Text>
                </View>
                {memory.pinned ? (
                  <Icon as={Pin} size={12} className="text-primary" />
                ) : null}
                <View className="flex-1" />
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    pinMemory({
                      memoryId: memory._id,
                      pinned: !memory.pinned,
                    }).catch(() =>
                      Alert.alert("Couldn't update pin", "Please try again."),
                    )
                  }
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                >
                  <Icon
                    as={memory.pinned ? PinOff : Pin}
                    size={14}
                    className="text-muted-foreground"
                  />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => handleDelete(memory._id)}
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                >
                  <Icon as={Trash2} size={14} className="text-destructive" />
                </Pressable>
              </View>
              <Text className="mt-2 text-[13.5px] leading-5 text-foreground/90">
                {memory.content}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

type ExportFormat = "json" | "markdown" | "zip";

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  icon: typeof FileJson;
}[] = [
  { value: "zip", label: "ZIP archive", icon: FileArchive },
  { value: "json", label: "JSON", icon: FileJson },
  { value: "markdown", label: "Markdown", icon: FileText },
];

const IMPORT_PROVIDERS: {
  value: "chatgpt" | "kontinue";
  label: string;
  hint: string;
}[] = [
  {
    value: "chatgpt",
    label: "ChatGPT",
    hint: "conversations.json from your OpenAI data export",
  },
  {
    value: "kontinue",
    label: "Kontinue",
    hint: "a JSON file previously exported from Kontinue AI",
  },
];

function DataPanel() {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("zip");
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<Id<"dataExports"> | null>(
    null,
  );
  const [importProvider, setImportProvider] = useState<"chatgpt" | "kontinue">(
    "chatgpt",
  );
  const [isUploading, setIsUploading] = useState(false);

  const exports = useQuery(api.exports.listExports, {});
  const requestExport = useMutation(api.exports.requestExport);
  const deleteExport = useMutation(api.exports.deleteExport);
  const getDownloadUrl = useAction(api.exportsWorker.getDownloadUrl);

  const importJobs = useQuery(api.imports.listImportJobs, {});
  const uploadLimit = useQuery(api.imports.getUploadLimit, {});
  const prepareImport = useMutation(api.imports.prepareImport);
  const confirmImportUpload = useMutation(api.imports.confirmImportUpload);
  const cancelImport = useMutation(api.imports.cancelImport);
  const createUploadUrl = useAction(api.importsWorker.createUploadUrl);

  const activeImport = importJobs?.find(
    (job) => job.status === "queued" || job.status === "processing",
  );

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await requestExport({ format: exportFormat });
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      Alert.alert(
        "Couldn't start export",
        data?.message ?? "Please try again.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async (
    exportId: Id<"dataExports">,
    format: ExportFormat,
  ) => {
    if (downloadingId) return;
    setDownloadingId(exportId);
    try {
      const { url } = await getDownloadUrl({ exportId });
      const extension =
        format === "zip" ? "zip" : format === "json" ? "json" : "md";
      // exportId is unique per export — keeps the compiler's purity rule happy
      // (no Date.now() in component scope) and avoids filename collisions.
      const localUri = `${FileSystem.cacheDirectory}kontinue-export-${exportId}.${extension}`;
      const result = await FileSystem.downloadAsync(url, localUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      } else {
        Alert.alert("Downloaded", `Saved to ${result.uri}`);
      }
    } catch (err) {
      Alert.alert(
        "Download failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImport = async () => {
    if (isUploading || activeImport) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "application/zip", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      const size = asset.size ?? 0;
      if (uploadLimit && size > uploadLimit.limitBytes) {
        Alert.alert(
          "File too large",
          `Your plan allows imports up to ${formatBytes(uploadLimit.limitBytes)}.`,
        );
        return;
      }

      setIsUploading(true);
      const contentType = asset.mimeType ?? "application/json";
      const { jobId } = await prepareImport({
        provider: importProvider,
        filename: asset.name,
        contentLength: size,
        contentType,
      });
      const { uploadUrl } = await createUploadUrl({ jobId });
      // The signed URL pins content-type + length, so the PUT must match.
      const upload = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": contentType },
      });
      if (upload.status < 200 || upload.status >= 300) {
        throw new Error(`Upload failed (${upload.status})`);
      }
      await confirmImportUpload({ jobId });
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      Alert.alert(
        "Import failed",
        data?.message ??
          (err instanceof Error ? err.message : "Please try again."),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">Data</Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Export your conversations and memories, or import history from other
          providers.
        </Text>
      </View>

      {/* Export */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">
          Export your data
        </Text>
        <View className="mt-3 flex-row gap-1.5">
          {FORMAT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setExportFormat(option.value)}
              className={cn(
                "flex-1 items-center gap-1 rounded-xl border px-2 py-2.5",
                exportFormat === option.value
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-secondary",
              )}
            >
              <Icon
                as={option.icon}
                size={16}
                className={
                  exportFormat === option.value
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={cn(
                  "text-[11.5px] font-medium",
                  exportFormat === option.value
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          disabled={isExporting}
          onPress={() => void handleExport()}
          className={cn(
            "mt-3 h-10 flex-row items-center justify-center gap-2 rounded-xl",
            isExporting ? "bg-primary/40" : "bg-primary active:opacity-90",
          )}
        >
          <Icon as={Download} size={15} className="text-primary-foreground" />
          <Text className="text-[13.5px] font-semibold text-primary-foreground">
            {isExporting ? "Starting…" : "Create export"}
          </Text>
        </Pressable>

        {(exports ?? []).length > 0 ? (
          <View className="mt-4 gap-2">
            {(exports ?? []).map((row) => (
              <View
                key={row._id}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5"
              >
                <View className="flex-1">
                  <Text className="text-[13px] font-medium uppercase text-foreground">
                    {row.format}
                    {row.byteSize ? (
                      <Text className="text-[12px] font-normal text-muted-foreground">
                        {"  "}
                        {formatBytes(row.byteSize)}
                      </Text>
                    ) : null}
                  </Text>
                  <Text className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {row.status === "processing"
                      ? "Preparing…"
                      : row.status === "ready"
                        ? new Date(row.createdAt).toLocaleString()
                        : (row.errorMessage ?? "Failed")}
                  </Text>
                </View>
                {row.status === "processing" ? (
                  <ActivityIndicator size="small" />
                ) : row.status === "ready" && row.hasFile ? (
                  <Pressable
                    disabled={downloadingId !== null}
                    onPress={() =>
                      void handleDownload(row._id, row.format as ExportFormat)
                    }
                    className="rounded-full bg-primary/15 px-3 py-1.5 active:opacity-80"
                  >
                    {downloadingId === row._id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text className="text-[12px] font-semibold text-primary">
                        Download
                      </Text>
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void deleteExport({ exportId: row._id }).catch(() =>
                      Alert.alert(
                        "Couldn't delete export",
                        "Please try again.",
                      ),
                    )
                  }
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                >
                  <Icon
                    as={Trash2}
                    size={14}
                    className="text-muted-foreground"
                  />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Import */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">
          Import history
        </Text>
        <View className="mt-3 flex-row gap-1.5">
          {IMPORT_PROVIDERS.map((provider) => (
            <Pressable
              key={provider.value}
              onPress={() => setImportProvider(provider.value)}
              className={cn(
                "rounded-full border px-3.5 py-2",
                importProvider === provider.value
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-secondary",
              )}
            >
              <Text
                className={cn(
                  "text-[12.5px] font-medium",
                  importProvider === provider.value
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {provider.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-2 text-[11.5px] leading-4 text-muted-foreground">
          Upload{" "}
          {IMPORT_PROVIDERS.find((p) => p.value === importProvider)?.hint}.
          {uploadLimit
            ? ` Up to ${formatBytes(uploadLimit.limitBytes)} on your plan.`
            : ""}
        </Text>

        {activeImport ? (
          <View className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="flex-1 text-[12.5px] text-foreground">
                Importing… {activeImport.processedConversations}/
                {activeImport.totalConversations || "?"} conversations
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <View
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.round((activeImport.progress ?? 0) * 100)}%`,
                }}
              />
            </View>
            <Pressable
              accessibilityLabel="Cancel import"
              onPress={() =>
                void cancelImport({ jobId: activeImport._id }).catch(() =>
                  Alert.alert("Couldn't cancel import", "Please try again."),
                )
              }
              className="mt-2 min-h-10 self-end justify-center px-2"
            >
              <Text className="text-[12px] font-semibold text-destructive">
                Cancel import
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            disabled={isUploading}
            onPress={() => void handleImport()}
            className={cn(
              "mt-3 h-10 flex-row items-center justify-center gap-2 rounded-xl border",
              isUploading
                ? "border-border bg-secondary"
                : "border-border active:bg-accent",
            )}
          >
            {isUploading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Icon as={Upload} size={15} className="text-foreground" />
            )}
            <Text className="text-[13.5px] font-medium text-foreground">
              {isUploading ? "Uploading…" : "Choose file"}
            </Text>
          </Pressable>
        )}

        {(importJobs ?? []).length ? (
          <View className="mt-3 gap-2">
            {(importJobs ?? []).map((job) => (
              <ImportJobRow key={job._id} jobId={job._id} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ImportJobRow({ jobId }: { jobId: Id<"importJobs"> }) {
  const detail = useQuery(api.imports.getImportJob, { jobId });
  if (!detail) return null;

  const { job, phase1, phase2, currentChunk } = detail;
  const active = job.status === "queued" || job.status === "processing";
  const percent = Math.round((job.progress ?? 0) * 100);
  const statusColor =
    job.status === "completed"
      ? "#10b981"
      : job.status === "failed"
        ? "#ef4444"
        : job.status === "canceled"
          ? "#94a3b8"
          : "#f59e0b";

  return (
    <View className="rounded-xl border border-border bg-secondary/40 p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[12.5px] font-medium text-foreground">
            {job.sourceFilename ?? job.provider}
          </Text>
          <Text className="mt-0.5 text-[10.5px] capitalize" style={{ color: statusColor }}>
            {active ? (job.currentStage ?? "Processing") : job.status}
          </Text>
        </View>
        <Text className="text-[10.5px] tabular-nums text-muted-foreground">
          {percent}%
        </Text>
      </View>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: statusColor }}
        />
      </View>
      <View className="mt-2 flex-row justify-between gap-3">
        <Text className="text-[10.5px] text-muted-foreground">
          Priority {phase1.done}/{phase1.total || 0} · Background {phase2.done}/
          {phase2.total || 0}
        </Text>
        <Text className="text-[10.5px] text-muted-foreground">
          {job.processedConversations}/{job.totalConversations || 0}
        </Text>
      </View>
      {currentChunk && active ? (
        <Text className="mt-1.5 text-[10.5px] italic text-muted-foreground">
          Importing {currentChunk.chunkType} batch · {currentChunk.conversationCount} chats
        </Text>
      ) : null}
      {job.status === "failed" && job.errorMessage ? (
        <Text className="mt-2 text-[11px] leading-4 text-destructive">
          {job.errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

function UsageBar({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number | null;
  note?: string;
}) {
  const unlimited = limit == null;
  const pct =
    unlimited || limit === 0
      ? 0
      : Math.min(100, Math.round((used / limit) * 100));
  return (
    <View>
      <View className="mb-1.5 flex-row justify-between">
        <Text className="text-[13.5px] font-medium text-foreground">
          {label}
        </Text>
        <Text className="text-[13.5px] text-muted-foreground">
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
      {note ? (
        <Text className="mt-1.5 text-[11.5px] leading-4 text-muted-foreground/80">
          {note}
        </Text>
      ) : null}
    </View>
  );
}
