import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { type Href, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  KODE_WEB_BUILD_CREDIT_RESERVATION,
  KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import {
  Code2,
  ExternalLink,
  FileCode2,
  Paperclip,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { API_BASE_URL } from "@/lib/chat-api";
import {
  appendKodeAttachments,
  pickKodeAttachments,
  type KodeAttachment,
} from "@/lib/kode-attachments";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#94a3b8" },
  building: { label: "Building", color: "#f59e0b" },
  ready: { label: "Ready", color: "#22c55e" },
  error: { label: "Needs attention", color: "#ef4444" },
};

export default function KodeScreen() {
  const { mutedForeground, primaryForeground } = useTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const projects = useQuery(api.kodeWeb.listProjects, { limit: 30 });
  const credits = useQuery(api.kodeWeb.getCredits, {});
  const createProject = useMutation(api.kodeWeb.createProject);
  const [composerOpen, setComposerOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"build" | "plan">("build");
  const [attachments, setAttachments] = useState<KodeAttachment[]>([]);

  const openWorkspace = (projectId: Id<"kodeWebProjects">) => {
    router.push(`/kode/${projectId}` as Href);
  };

  const create = async () => {
    const value = prompt.trim();
    if (value.length < 3 || creating) return;
    setCreating(true);
    let projectId: Id<"kodeWebProjects"> | null = null;
    try {
      projectId = await createProject({ prompt: value });
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
        throw new Error(result.error ?? "Kode could not queue the project.");
      }

      setPrompt("");
      setAttachments([]);
      setComposerOpen(false);
      openWorkspace(projectId);
    } catch (error) {
      const data = (error as { data?: { message?: string } })?.data;
      Alert.alert(
        "Couldn't create Kode project",
        data?.message ??
          (error instanceof Error ? error.message : "Please try again."),
      );
      if (projectId) openWorkspace(projectId);
    } finally {
      setCreating(false);
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

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader
        title="Kode"
        right={
          credits?.isPro ? (
            <Pressable
              onPress={() => setComposerOpen(true)}
              className="min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-3.5 active:opacity-90"
            >
              <Icon as={Plus} size={17} className="text-primary-foreground" />
              <Text className="text-[13px] font-semibold text-primary-foreground">
                New
              </Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="gap-5 px-4 pb-12"
        showsVerticalScrollIndicator={false}
      >
        <View className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/8 p-4">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <Icon as={Code2} size={21} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-foreground">
                Build with Kode
              </Text>
              <Text className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                Build, preview, edit, download, and refine complete web projects
                without leaving the app.
              </Text>
            </View>
          </View>
        </View>

        {credits === undefined ? (
          <View className="h-20 items-center justify-center rounded-2xl bg-foreground/5">
            <ActivityIndicator size="small" />
          </View>
        ) : !credits?.isPro ? (
          <View className="items-center rounded-2xl border border-border bg-card px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Icon as={Sparkles} size={22} className="text-primary" />
            </View>
            <Text className="mt-4 text-[16px] font-semibold text-foreground">
              Kode is on Pro and Max
            </Text>
            <Text className="mt-2 text-center text-[12.5px] leading-5 text-muted-foreground">
              Upgrade to create and iterate on complete web projects with K-AI.
            </Text>
            <Pressable
              onPress={() => router.push("/pricing" as Href)}
              className="mt-5 min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-4 active:opacity-90"
            >
              <Text className="text-[13px] font-semibold text-primary-foreground">
                View plans
              </Text>
              <Icon
                as={ExternalLink}
                size={14}
                className="text-primary-foreground"
              />
            </Pressable>
          </View>
        ) : (
          <>
            <View className="flex-row gap-2">
              <Metric label="Credits left" value={credits.remaining} />
              <Metric
                label="Builds used"
                value={`${credits.buildsUsed}/${credits.buildLimit}`}
              />
            </View>

            <View>
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[15px] font-semibold text-foreground">
                  Your projects
                </Text>
                <Text className="text-[11.5px] text-muted-foreground">
                  {projects?.length ?? 0} project
                  {projects?.length === 1 ? "" : "s"}
                </Text>
              </View>
              {projects === undefined ? (
                <View className="gap-2">
                  {[1, 2, 3].map((item) => (
                    <View
                      key={item}
                      className="h-24 rounded-2xl bg-foreground/5"
                    />
                  ))}
                </View>
              ) : projects.length === 0 ? (
                <Pressable
                  onPress={() => setComposerOpen(true)}
                  className="items-center rounded-2xl border border-dashed border-border px-5 py-12 active:bg-accent"
                >
                  <Icon
                    as={FileCode2}
                    size={23}
                    className="text-muted-foreground"
                  />
                  <Text className="mt-3 text-[14px] font-medium text-foreground">
                    Create your first project
                  </Text>
                  <Text className="mt-1.5 text-center text-[12px] text-muted-foreground">
                    Describe what you want to build and Kode will prepare the
                    workspace.
                  </Text>
                </Pressable>
              ) : (
                <View className="gap-2">
                  {projects.map((project) => {
                    const status =
                      STATUS_META[project.status] ?? STATUS_META.draft!;
                    return (
                      <Pressable
                        key={project._id}
                        onPress={() => openWorkspace(project._id)}
                        className="min-h-24 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:bg-accent"
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                          <Icon
                            as={FileCode2}
                            size={19}
                            className="text-muted-foreground"
                          />
                        </View>
                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              className="flex-1 text-[14px] font-semibold text-foreground"
                            >
                              {project.title}
                            </Text>
                            {project.starred ? (
                              <Icon
                                as={Star}
                                size={13}
                                className="text-amber-400"
                              />
                            ) : null}
                          </View>
                          <Text
                            numberOfLines={2}
                            className="mt-1 text-[11.5px] leading-4 text-muted-foreground"
                          >
                            {project.description}
                          </Text>
                          <View className="mt-2 flex-row items-center gap-1.5">
                            <View
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: status.color }}
                            />
                            <Text
                              className="text-[10.5px] font-medium"
                              style={{ color: status.color }}
                            >
                              {status.label}
                            </Text>
                          </View>
                        </View>
                        <Icon
                          as={Code2}
                          size={16}
                          className="text-muted-foreground/60"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end bg-black/55"
        >
          <View className="rounded-t-3xl border-t border-border bg-background px-5 pb-10 pt-4">
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                  Kode
                </Text>
                <Text className="mt-1 text-[20px] font-semibold text-foreground">
                  Start a project
                </Text>
              </View>
              <Pressable
                onPress={() => setComposerOpen(false)}
                className="h-11 w-11 items-center justify-center rounded-xl bg-secondary"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              multiline
              maxLength={8000}
              placeholder="Describe the app or site you want to build…"
              placeholderTextColor={mutedForeground}
              className="min-h-32 rounded-2xl border border-border bg-secondary px-4 py-3 text-[14px] leading-5 text-foreground"
            />
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach code or text files"
                onPress={() => void attachFiles()}
                className="min-h-11 flex-row items-center gap-2 rounded-xl border border-border bg-secondary px-3"
              >
                <Icon
                  as={Paperclip}
                  size={15}
                  className="text-muted-foreground"
                />
                <Text className="text-[12px] font-medium text-foreground">
                  Attach files
                </Text>
              </Pressable>
              {attachments.map((attachment) => (
                <View
                  key={attachment.uri}
                  className="min-h-11 max-w-48 flex-row items-center gap-1.5 rounded-xl bg-primary/10 px-3"
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
            </View>
            <View className="mt-3 flex-row gap-2">
              {(["build", "plan"] as const).map((option) => {
                const selected = mode === option;
                const cost =
                  option === "build"
                    ? KODE_WEB_BUILD_CREDIT_RESERVATION
                    : KODE_WEB_PLAN_CREDIT_RESERVATION;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setMode(option)}
                    className={cn(
                      "min-h-11 flex-1 items-center justify-center rounded-xl border px-3",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-[12.5px] font-semibold capitalize",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {option} · {cost} credits
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              disabled={prompt.trim().length < 3 || creating}
              onPress={() => void create()}
              className={cn(
                "mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-xl",
                prompt.trim().length >= 3 && !creating
                  ? "bg-primary"
                  : "bg-primary/35",
              )}
            >
              {creating ? (
                <ActivityIndicator size="small" color={primaryForeground} />
              ) : (
                <Icon
                  as={Sparkles}
                  size={16}
                  className="text-primary-foreground"
                />
              )}
              <Text className="text-[13.5px] font-semibold text-primary-foreground">
                {creating
                  ? mode === "build"
                    ? "Queueing build…"
                    : "Queueing plan…"
                  : mode === "build"
                    ? "Build project"
                    : "Create project plan"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-[19px] font-semibold text-foreground">{value}</Text>
      <Text className="mt-1 text-[11.5px] text-muted-foreground">{label}</Text>
    </View>
  );
}
