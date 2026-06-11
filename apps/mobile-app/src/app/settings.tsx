import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { useRouter, type Href } from "expo-router";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { planLabel } from "@repo/core/plan-tier";
import { formatBytes, memoryTypeLabel, type MemoryType } from "@repo/core/memory";
import {
  ChevronRight,
  Download,
  FileArchive,
  FileJson,
  FileText,
  LogOut,
  Pin,
  PinOff,
  Plug,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { API_BASE_URL } from "@/lib/chat-api";
import { ModeToggle } from "@/components/mode-toggle";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";

type SettingsTab = "account" | "memory" | "data";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "memory", label: "Memory" },
  { id: "data", label: "Data" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const planTier = usePlanTier();
  const [tab, setTab] = useState<SettingsTab>("account");

  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title="Settings" right={<ModeToggle />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10 gap-5"
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View className="items-center rounded-2xl border border-border bg-card px-4 py-6">
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : (
            <View className="h-18 w-18 items-center justify-center rounded-full bg-primary" style={{ width: 72, height: 72 }}>
              <Text className="text-[26px] font-bold text-primary-foreground">{initial}</Text>
            </View>
          )}
          <Text className="mt-4 text-[19px] font-bold text-foreground">{displayName}</Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">{email}</Text>
          <View className="mt-3 rounded-lg bg-secondary px-3 py-1.5">
            <Text className="text-[12px] font-semibold text-foreground">
              {planLabel(planTier)} Plan
            </Text>
          </View>
        </View>

        {/* Current plan */}
        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-[15px] font-semibold text-foreground">Current plan</Text>
          <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
            {planTier === "free"
              ? "You are on the free plan. Upgrade when you need more limits."
              : `You are on the ${planLabel(planTier)} plan.`}
          </Text>
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(`${API_BASE_URL}/pricing`)}
            className="mt-3 self-start rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 active:opacity-80"
          >
            <Text className="text-[13px] font-semibold text-primary">View pricing</Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View className="flex-row gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              className={cn(
                "h-9 flex-1 items-center justify-center rounded-lg",
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
        </View>

        {tab === "account" ? <AccountPanel planTier={planTier} /> : null}
        {tab === "memory" ? <MemoryPanel /> : null}
        {tab === "data" ? <DataPanel /> : null}

        {/* Footer actions */}
        <View>
          <Pressable
            onPress={() => router.push("/connectors" as Href)}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={Plug} size={18} className="text-muted-foreground" />
            <Text className="flex-1 text-[14px] text-foreground">Connectors</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground/50" />
          </Pressable>
          {planTier === "free" ? (
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(`${API_BASE_URL}/pricing`)}
              className="mt-2 flex-row items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3.5 active:opacity-80"
            >
              <Icon as={Sparkles} size={18} className="text-primary" />
              <Text className="flex-1 text-[14px] font-medium text-primary">Upgrade</Text>
              <Icon as={ChevronRight} size={18} className="text-primary/60" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void signOut()}
            className="mt-2 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
          >
            <Icon as={LogOut} size={18} className="text-destructive" />
            <Text className="flex-1 text-[14px] text-destructive">Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Account: usage ───────────────────────────────────────────────────────────

function AccountPanel({ planTier }: { planTier: string }) {
  const usage = useQuery(api.messages.getMonthlyUsage, {});

  return (
    <View className="gap-3">
      <View>
        <Text className="text-[16px] font-semibold text-foreground">Usage</Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Track monthly message and import usage.
        </Text>
      </View>
      <View className="gap-5 rounded-2xl border border-border bg-card p-4">
        {usage === undefined ? (
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
      {planTier !== "free" ? null : null}
    </View>
  );
}

// ── Memory ───────────────────────────────────────────────────────────────────

function MemoryPanel() {
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
        <Text className="text-[16px] font-semibold text-foreground">Memory</Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
          Review what Kontinue AI keeps, pin important context, and free up
          space when storage reaches your plan limit.
        </Text>
      </View>

      {/* Quota */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-start justify-between">
          <Text className="text-[14px] font-medium text-foreground">Memory Usage</Text>
          {memoryStatus ? (
            <View className="items-end">
              <Text className="text-[13px] font-medium text-foreground">
                {memoryStatus.usedBytesLabel} / {memoryStatus.limitBytesLabel}
              </Text>
              <Text className="text-[11px] text-muted-foreground">
                {memoryStatus.memoryCount} memories, {memoryStatus.summaryCount} summaries
              </Text>
            </View>
          ) : null}
        </View>
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, memoryStatus?.usagePercent ?? 0)}%` }}
          />
        </View>
        {memoryStatus?.warning ? (
          <Text className="mt-2 text-[12px] text-amber-500">{memoryStatus.warning}</Text>
        ) : null}
      </View>

      {/* Manual save */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">Save Memory Manually</Text>
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
                  manualType === type ? "text-primary" : "text-muted-foreground",
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
          placeholderTextColor="#7c6c77"
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
            <ActivityIndicator size="small" color="#fff" />
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
          placeholderTextColor="#7c6c77"
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
            {search ? "No memories match your search." : "No memories yet — they build up as you chat."}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {memories.map((memory) => (
            <View key={memory._id} className="rounded-2xl border border-border bg-card p-3.5">
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
                    pinMemory({ memoryId: memory._id, pinned: !memory.pinned }).catch(
                      () => Alert.alert("Couldn't update pin", "Please try again."),
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

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof FileJson }[] = [
  { value: "zip", label: "ZIP archive", icon: FileArchive },
  { value: "json", label: "JSON", icon: FileJson },
  { value: "markdown", label: "Markdown", icon: FileText },
];

const IMPORT_PROVIDERS: { value: "chatgpt" | "kontinue"; label: string; hint: string }[] = [
  { value: "chatgpt", label: "ChatGPT", hint: "conversations.json from your OpenAI data export" },
  { value: "kontinue", label: "Kontinue", hint: "a JSON file previously exported from Kontinue AI" },
];

function DataPanel() {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("zip");
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<Id<"dataExports"> | null>(null);
  const [importProvider, setImportProvider] = useState<"chatgpt" | "kontinue">("chatgpt");
  const [isUploading, setIsUploading] = useState(false);

  const exports = useQuery(api.exports.listExports, {});
  const requestExport = useMutation(api.exports.requestExport);
  const deleteExport = useMutation(api.exports.deleteExport);
  const getDownloadUrl = useAction(api.exportsWorker.getDownloadUrl);

  const importJobs = useQuery(api.imports.listImportJobs, {});
  const uploadLimit = useQuery(api.imports.getUploadLimit, {});
  const prepareImport = useMutation(api.imports.prepareImport);
  const confirmImportUpload = useMutation(api.imports.confirmImportUpload);
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
      Alert.alert("Couldn't start export", data?.message ?? "Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async (exportId: Id<"dataExports">, format: ExportFormat) => {
    if (downloadingId) return;
    setDownloadingId(exportId);
    try {
      const { url } = await getDownloadUrl({ exportId });
      const extension = format === "zip" ? "zip" : format === "json" ? "json" : "md";
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
        data?.message ?? (err instanceof Error ? err.message : "Please try again."),
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
        <Text className="text-[14px] font-medium text-foreground">Export your data</Text>
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
                className={exportFormat === option.value ? "text-primary" : "text-muted-foreground"}
              />
              <Text
                className={cn(
                  "text-[11.5px] font-medium",
                  exportFormat === option.value ? "text-primary" : "text-muted-foreground",
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
                        {"  "}{formatBytes(row.byteSize)}
                      </Text>
                    ) : null}
                  </Text>
                  <Text className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {row.status === "processing"
                      ? "Preparing…"
                      : row.status === "ready"
                        ? new Date(row.createdAt).toLocaleString()
                        : row.errorMessage ?? "Failed"}
                  </Text>
                </View>
                {row.status === "processing" ? (
                  <ActivityIndicator size="small" />
                ) : row.status === "ready" && row.hasFile ? (
                  <Pressable
                    disabled={downloadingId !== null}
                    onPress={() => void handleDownload(row._id, row.format as ExportFormat)}
                    className="rounded-full bg-primary/15 px-3 py-1.5 active:opacity-80"
                  >
                    {downloadingId === row._id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <Text className="text-[12px] font-semibold text-primary">Download</Text>
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    void deleteExport({ exportId: row._id }).catch(() =>
                      Alert.alert("Couldn't delete export", "Please try again."),
                    )
                  }
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                >
                  <Icon as={Trash2} size={14} className="text-muted-foreground" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Import */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <Text className="text-[14px] font-medium text-foreground">Import history</Text>
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
                  importProvider === provider.value ? "text-primary" : "text-muted-foreground",
                )}
              >
                {provider.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-2 text-[11.5px] leading-4 text-muted-foreground">
          Upload {IMPORT_PROVIDERS.find((p) => p.value === importProvider)?.hint}.
          {uploadLimit ? ` Up to ${formatBytes(uploadLimit.limitBytes)} on your plan.` : ""}
        </Text>

        {activeImport ? (
          <View className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="flex-1 text-[12.5px] text-foreground">
                Importing… {activeImport.processedConversations}/{activeImport.totalConversations || "?"} conversations
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((activeImport.progress ?? 0) * 100)}%` }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            disabled={isUploading}
            onPress={() => void handleImport()}
            className={cn(
              "mt-3 h-10 flex-row items-center justify-center gap-2 rounded-xl border",
              isUploading ? "border-border bg-secondary" : "border-border active:bg-accent",
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
      </View>
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
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <View>
      <View className="mb-1.5 flex-row justify-between">
        <Text className="text-[13.5px] font-medium text-foreground">{label}</Text>
        <Text className="text-[13.5px] text-muted-foreground">
          {used} / {unlimited ? "Unlimited" : limit}
        </Text>
      </View>
      {!unlimited ? (
        <View className="h-2 overflow-hidden rounded-full bg-secondary">
          <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </View>
      ) : null}
      {note ? (
        <Text className="mt-1.5 text-[11.5px] leading-4 text-muted-foreground/80">{note}</Text>
      ) : null}
    </View>
  );
}
