import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  KODE_WEB_BUILD_CREDIT_RESERVATION,
  KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import {
  buildKodePreviewDocument,
  kodeDownloadFilename,
} from "@repo/core/kode-preview";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { WebView } from "react-native-webview";
import {
  ArrowLeft,
  Check,
  Code2,
  Download,
  Eye,
  FileCode2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Save,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";
import { API_BASE_URL } from "@/lib/chat-api";
import {
  appendKodeAttachments,
  pickKodeAttachments,
  type KodeAttachment,
} from "@/lib/kode-attachments";
import { cn } from "@/lib/utils";

type WorkspaceTab = "conversation" | "preview" | "code";
type KodeMode = "build" | "plan";

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function errorText(error: unknown, fallback: string) {
  const data = (error as { data?: { message?: string } })?.data;
  return data?.message ?? (error instanceof Error ? error.message : fallback);
}

export default function KodeWorkspaceScreen() {
  const { primary, mutedForeground, primaryForeground } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const projectId = id as Id<"kodeWebProjects"> | undefined;
  const workspace = useQuery(
    api.kodeWeb.getWorkspace,
    projectId ? { projectId } : "skip",
  );
  const updateFile = useMutation(api.kodeWeb.updateFile);
  const renameProject = useMutation(api.kodeWeb.renameProject);
  const toggleStar = useMutation(api.kodeWeb.toggleStar);
  const deleteProject = useMutation(api.kodeWeb.deleteProject);

  const [tab, setTab] = useState<WorkspaceTab>("conversation");
  const [mode, setMode] = useState<KodeMode>("build");
  const [prompt, setPrompt] = useState("");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("index.html");
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [queueing, setQueueing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [attachments, setAttachments] = useState<KodeAttachment[]>([]);

  const selectedFile =
    workspace?.files.find((file) => file.path === selectedPath) ??
    workspace?.files[0];
  const effectiveSelectedPath = selectedFile?.path ?? selectedPath;
  const draft = selectedFile
    ? (fileDrafts[selectedFile.path] ?? selectedFile.content)
    : "";

  const previewDocument = useMemo(
    () =>
      buildKodePreviewDocument(
        (workspace?.files ?? []).map((file) => ({
          path: file.path,
          content: file.path === effectiveSelectedPath ? draft : file.content,
        })),
      ),
    [draft, effectiveSelectedPath, workspace?.files],
  );

  const dirty = !!selectedFile && draft !== selectedFile.content;
  const building = queueing || workspace?.project.status === "building";
  const requiredCredits =
    mode === "build"
      ? KODE_WEB_BUILD_CREDIT_RESERVATION
      : KODE_WEB_PLAN_CREDIT_RESERVATION;

  const saveFile = async () => {
    if (!projectId || !selectedFile || !dirty || saving) return true;
    setSaving(true);
    try {
      await updateFile({
        projectId,
        path: selectedFile.path,
        content: draft,
      });
      return true;
    } catch (error) {
      Alert.alert("Couldn't save file", errorText(error, "Please try again."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const queueBuild = async () => {
    const value = prompt.trim();
    if (
      !projectId ||
      value.length < 3 ||
      building ||
      (workspace?.credits.remaining ?? 0) < requiredCredits
    ) {
      return;
    }

    setQueueing(true);
    try {
      if (dirty && !(await saveFile())) return;
      const token = await getToken();
      if (!token) throw new Error("Your session could not be verified.");

      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("prompt", value);
      formData.append("mode", mode);
      appendKodeAttachments(formData, attachments);
      const response = await fetch(`${API_BASE_URL}/api/kode/build`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Kode could not queue this request.");
      }
      setPrompt("");
      setAttachments([]);
      if (mode === "build") setTab("preview");
    } catch (error) {
      Alert.alert("Couldn't start Kode", errorText(error, "Please try again."));
    } finally {
      setQueueing(false);
    }
  };

  const attachFiles = async () => {
    const result = await pickKodeAttachments(attachments.length);
    if (result.rejected.length) {
      Alert.alert("Some files weren't added", result.rejected.join("\n"));
    }
    if (result.attachments.length) {
      setAttachments((current) => [...current, ...result.attachments]);
    }
  };

  const saveTitle = async () => {
    if (!projectId || !workspace) return;
    const value = (titleDraft ?? workspace.project.title).trim();
    if (!value || value === workspace.project.title) {
      setTitleDraft(null);
      return;
    }
    try {
      await renameProject({ projectId, title: value });
      setTitleDraft(null);
    } catch (error) {
      setTitleDraft(null);
      Alert.alert(
        "Couldn't rename project",
        errorText(error, "Please try again."),
      );
    }
  };

  const exportHtml = async () => {
    if (!workspace) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("File sharing is not available on this device.");
      }
      const file = new File(
        Paths.cache,
        kodeDownloadFilename(workspace.project.title),
      );
      file.create({ overwrite: true });
      file.write(previewDocument);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/html",
        dialogTitle: "Export Kode project",
        UTI: "public.html",
      });
    } catch (error) {
      Alert.alert(
        "Couldn't export project",
        errorText(error, "Please try again."),
      );
    }
  };

  const confirmDelete = () => {
    if (!projectId) return;
    Alert.alert(
      "Delete Kode project?",
      "This removes the project, messages, files, and build history permanently.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteProject({ projectId })
              .then(() => router.replace("/kode" as Href))
              .catch((error) =>
                Alert.alert(
                  "Couldn't delete project",
                  errorText(error, "Please try again."),
                ),
              );
          },
        },
      ],
    );
  };

  if (workspace === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={primary} />
        <Text className="mt-3 text-[13px] text-muted-foreground">
          Opening Kode workspace…
        </Text>
      </SafeAreaView>
    );
  }

  if (workspace === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Icon as={Code2} size={30} className="text-muted-foreground" />
        <Text className="mt-4 text-[16px] font-semibold text-foreground">
          Project not found
        </Text>
        <Pressable
          onPress={() => router.replace("/kode" as Href)}
          className="mt-4 min-h-11 justify-center rounded-xl bg-primary px-5"
        >
          <Text className="font-semibold text-primary-foreground">
            Back to Kode
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="min-h-14 flex-row items-center gap-2 border-b border-border px-3">
        <Pressable
          accessibilityLabel="Back to Kode projects"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
        >
          <Icon as={ArrowLeft} size={20} className="text-foreground" />
        </Pressable>
        <TextInput
          accessibilityLabel="Project title"
          value={titleDraft ?? workspace.project.title}
          onChangeText={setTitleDraft}
          onBlur={() => void saveTitle()}
          onSubmitEditing={() => void saveTitle()}
          className="min-w-0 flex-1 text-[14.5px] font-semibold text-foreground"
          returnKeyType="done"
        />
        <Pressable
          accessibilityLabel={
            workspace.project.starred ? "Unstar project" : "Star project"
          }
          onPress={() => void toggleStar({ projectId: workspace.project._id })}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
        >
          <Icon
            as={Star}
            size={19}
            color={workspace.project.starred ? primary : undefined}
            fill={workspace.project.starred ? primary : "transparent"}
            className="text-muted-foreground"
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Export project HTML"
          onPress={() => void exportHtml()}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
        >
          <Icon as={Download} size={19} className="text-muted-foreground" />
        </Pressable>
        <Pressable
          accessibilityLabel="Delete project"
          onPress={confirmDelete}
          className="h-11 w-11 items-center justify-center rounded-xl active:bg-destructive/10"
        >
          <Icon as={Trash2} size={18} className="text-destructive" />
        </Pressable>
      </View>

      <View className="flex-row border-b border-border px-3 py-2">
        <WorkspaceTabButton
          label="Chat"
          icon={MessageSquare}
          active={tab === "conversation"}
          onPress={() => setTab("conversation")}
        />
        <WorkspaceTabButton
          label="Preview"
          icon={Eye}
          active={tab === "preview"}
          onPress={() => setTab("preview")}
        />
        <WorkspaceTabButton
          label="Code"
          icon={Code2}
          active={tab === "code"}
          onPress={() => setTab("code")}
        />
      </View>

      {tab === "conversation" ? (
        <ConversationPanel workspace={workspace} building={building} />
      ) : tab === "preview" ? (
        <View className="flex-1 bg-black/70 p-2">
          <View className="mb-2 flex-row items-center justify-between px-1">
            <Text className="text-[11px] text-white/55">
              v{workspace.project.activeVersion}
            </Text>
            <Pressable
              accessibilityLabel="Refresh preview"
              onPress={() => setPreviewNonce((value) => value + 1)}
              className="h-10 w-10 items-center justify-center rounded-lg bg-white/10"
            >
              <Icon as={RefreshCw} size={16} color={primaryForeground} />
            </Pressable>
          </View>
          {workspace.files.length ? (
            <View className="flex-1 overflow-hidden rounded-xl bg-white">
              <WebView
                key={`${workspace.project.activeVersion}-${previewNonce}`}
                source={{
                  html: previewDocument,
                  baseUrl: "https://kode.local/",
                }}
                originWhitelist={["https://kode.local", "about:blank"]}
                javaScriptEnabled
                setSupportMultipleWindows={false}
                allowsInlineMediaPlayback
                style={{ flex: 1, backgroundColor: "#fff" }}
              />
            </View>
          ) : (
            <EmptyBuildState
              building={building}
              error={workspace.project.lastError}
            />
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {workspace.files.length ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="max-h-12 border-b border-border"
                contentContainerClassName="items-end px-2 pt-2"
              >
                {workspace.files.map((file) => (
                  <Pressable
                    key={file._id}
                    onPress={() => setSelectedPath(file.path)}
                    className={cn(
                      "h-10 flex-row items-center gap-1.5 rounded-t-lg border-x border-t px-3",
                      selectedPath === file.path
                        ? "border-border bg-secondary"
                        : "border-transparent",
                    )}
                  >
                    <Icon
                      as={FileCode2}
                      size={14}
                      className="text-muted-foreground"
                    />
                    <Text className="text-[11.5px] text-foreground">
                      {file.path}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View className="min-h-11 flex-row items-center justify-between border-b border-border px-3">
                <Text className="text-[10.5px] text-muted-foreground">
                  {dirty ? "Unsaved changes" : "Saved"}
                </Text>
                <Pressable
                  accessibilityLabel="Save file"
                  disabled={!dirty || saving}
                  onPress={() => void saveFile()}
                  className="min-h-10 flex-row items-center gap-1.5 px-3 disabled:opacity-40"
                >
                  <Icon
                    as={saving ? Save : dirty ? Save : Check}
                    size={15}
                    className="text-primary"
                  />
                  <Text className="text-[12px] font-semibold text-primary">
                    Save
                  </Text>
                </Pressable>
              </View>
              <TextInput
                accessibilityLabel={`Edit ${effectiveSelectedPath}`}
                value={draft}
                onChangeText={(value) =>
                  setFileDrafts((current) => ({
                    ...current,
                    [effectiveSelectedPath]: value,
                  }))
                }
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textAlignVertical="top"
                className="flex-1 bg-[#151216] p-4 font-mono text-[12px] leading-5 text-[#eadce5]"
              />
            </>
          ) : (
            <EmptyBuildState
              building={building}
              error={workspace.project.lastError}
            />
          )}
        </KeyboardAvoidingView>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View className="border-t border-border bg-background px-3 pb-3 pt-2">
          <View className="mb-2 flex-row items-center gap-2">
            {(["build", "plan"] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === option }}
                disabled={building}
                onPress={() => setMode(option)}
                className={cn(
                  "min-h-9 justify-center rounded-lg px-3",
                  mode === option ? "bg-primary/12" : "bg-secondary",
                )}
              >
                <Text
                  className={cn(
                    "text-[11.5px] font-semibold capitalize",
                    mode === option ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
            <Text className="ml-auto text-[10.5px] text-muted-foreground">
              {workspace.credits.remaining} credits left
            </Text>
          </View>
          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2 max-h-11"
              contentContainerClassName="gap-2"
            >
              {attachments.map((attachment) => (
                <View
                  key={attachment.uri}
                  className="min-h-10 max-w-48 flex-row items-center gap-1.5 rounded-xl bg-primary/10 px-3"
                >
                  <Text
                    numberOfLines={1}
                    className="max-w-32 text-[11px] text-primary"
                  >
                    {attachment.name}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Remove ${attachment.name}`}
                    hitSlop={8}
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.uri !== attachment.uri),
                      )
                    }
                    className="h-7 w-7 items-center justify-center"
                  >
                    <Icon as={X} size={13} className="text-primary" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View className="flex-row items-end gap-2 rounded-2xl border border-border bg-secondary p-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach code or text files"
              disabled={building || attachments.length >= 5}
              onPress={() => void attachFiles()}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-foreground/5 disabled:opacity-35"
            >
              <Icon
                as={Paperclip}
                size={17}
                className="text-muted-foreground"
              />
            </Pressable>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              multiline
              maxLength={8000}
              editable={!building}
              placeholder={
                workspace.credits.remaining < requiredCredits
                  ? "Not enough credits for this mode"
                  : mode === "build"
                    ? "Ask Kode to change this app…"
                    : "Discuss the next change…"
              }
              placeholderTextColor={mutedForeground}
              className="max-h-28 min-h-11 flex-1 px-2 py-2.5 text-[13.5px] leading-5 text-foreground"
            />
            <Pressable
              accessibilityLabel={
                mode === "build" ? "Queue build" : "Queue plan"
              }
              disabled={
                prompt.trim().length < 3 ||
                building ||
                workspace.credits.remaining < requiredCredits
              }
              onPress={() => void queueBuild()}
              className="h-11 w-11 items-center justify-center rounded-xl bg-primary disabled:opacity-35"
            >
              {building ? (
                <ActivityIndicator size="small" color={primaryForeground} />
              ) : (
                <Icon as={Send} size={17} className="text-primary-foreground" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WorkspaceTabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: typeof Eye;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={cn(
        "min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl",
        active ? "bg-secondary" : "bg-transparent",
      )}
    >
      <Icon
        as={icon}
        size={15}
        className={active ? "text-primary" : "text-muted-foreground"}
      />
      <Text
        className={cn(
          "text-[12px] font-semibold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ConversationPanel({
  workspace,
  building,
}: {
  workspace: NonNullable<
    ReturnType<typeof useQuery<typeof api.kodeWeb.getWorkspace>>
  >;
  building: boolean;
}) {
  const { primary } = useTheme();
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 px-3 py-4"
      showsVerticalScrollIndicator={false}
    >
      {workspace.messages.length ? (
        workspace.messages.map((message) => (
          <View
            key={message._id}
            className={cn(
              "max-w-[88%] rounded-2xl px-3.5 py-3",
              message.role === "user"
                ? "ml-auto bg-primary"
                : "mr-auto border border-border bg-card",
            )}
          >
            <Text
              className={cn(
                "text-[13px] leading-5",
                message.role === "user"
                  ? "text-primary-foreground"
                  : "text-foreground/90",
              )}
            >
              {message.content}
            </Text>
            <Text
              className={cn(
                "mt-2 text-[9.5px]",
                message.role === "user"
                  ? "text-primary-foreground/60"
                  : "text-muted-foreground",
              )}
            >
              {message.role === "assistant" ? "Kode" : "You"} ·{" "}
              {TIME_FORMATTER.format(new Date(message.createdAt))}
            </Text>
          </View>
        ))
      ) : (
        <View className="items-center rounded-2xl border border-dashed border-border px-5 py-10">
          <Icon
            as={MessageSquare}
            size={24}
            className="text-muted-foreground"
          />
          <Text className="mt-3 text-center text-[12.5px] leading-5 text-muted-foreground">
            Ask Kode to build or change anything in this project.
          </Text>
        </View>
      )}
      {building ? (
        <View className="mr-auto flex-row items-center gap-2 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-3">
          <ActivityIndicator size="small" color={primary} />
          <Text className="text-[12px] text-foreground/80">
            {(workspace.builds[0]?.mode ?? "build") === "plan"
              ? "Kode is preparing the plan…"
              : "Kode is editing and validating…"}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyBuildState({
  building,
  error,
}: {
  building: boolean;
  error?: string;
}) {
  const { primary } = useTheme();
  return (
    <View className="flex-1 items-center justify-center px-6">
      {building ? (
        <ActivityIndicator color={primary} />
      ) : (
        <Icon as={Code2} size={28} className="text-muted-foreground" />
      )}
      <Text className="mt-4 text-[16px] font-semibold text-foreground">
        {building ? "Kode is assembling your app" : "No build yet"}
      </Text>
      <Text className="mt-2 text-center text-[12.5px] leading-5 text-muted-foreground">
        {error ?? "Use the composer below to describe what you want to build."}
      </Text>
    </View>
  );
}
