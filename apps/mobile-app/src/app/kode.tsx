import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/expo";
import { type Href, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc, Id } from "@repo/convex/convex/_generated/dataModel";
import {
  KODE_WEB_BUILD_CREDIT_RESERVATION,
  KODE_WEB_PLAN_CREDIT_RESERVATION,
} from "@repo/core/kode-web";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import {
  ArrowUpRight,
  Code2,
  FileCode2,
  LoaderCircle,
  Paperclip,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react-native";

import { KodeAccessGate, KodeComingSoon } from "@/components/kode/kode-gates";
import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { FadeInUp } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useKodeComingSoon } from "@/hooks/use-kode-availability";
import { usePlanTierState } from "@/hooks/use-plan-tier";
import { AppError, readApiError, showAppErrorToast } from "@/lib/app-errors";
import { API_BASE_URL } from "@/lib/chat-api";
import {
  appendKodeAttachments,
  pickKodeAttachments,
  type KodeAttachment,
} from "@/lib/kode-attachments";
import { cn } from "@/lib/utils";
import { softShadow } from "@/lib/shadow";

const STARTERS = [
  "Build a clean client portal for a creative agency",
  "Create a personal finance dashboard with interactive budgets",
  "Design a launch page for a developer tool",
];

/** Same gates as web /kode: availability first, then the Pro plan. */
export default function KodeScreen() {
  const { comingSoon } = useKodeComingSoon();
  const { tier, isLoaded } = usePlanTierState();
  if (comingSoon) return <KodeComingSoon />;
  if (!isLoaded) {
    return (
      <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Kode" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }
  if (!canAccessPlanFeature(tier, "kode")) return <KodeAccessGate />;
  return <KodeDashboard />;
}

function KodeDashboard() {
  const { mutedForeground, primaryForeground, primary } = useTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const firstName = user?.firstName?.trim() || "there";
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
      if (!response.ok) throw new AppError(await readApiError(response));

      setPrompt("");
      setAttachments([]);
      setComposerOpen(false);
      openWorkspace(projectId);
    } catch (error) {
      showAppErrorToast(error);
      if (projectId) openWorkspace(projectId);
    } finally {
      setCreating(false);
    }
  };

  const attachFiles = async () => {
    const result = await pickKodeAttachments(attachments.length);
    if (result.rejected.length) {
      toast.error("Some files weren't added", {
        description: result.rejected.join("\n"),
      });
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New Kode project"
            onPress={() => setComposerOpen(true)}
            className="h-9 flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 active:opacity-90"
            style={{
              ...softShadow({ color: primary, opacity: 0.35, radius: 10, offsetY: 4 }),
            }}
          >
            <Icon as={Plus} size={16} className="text-primary-foreground" />
            <Text className="text-[13px] font-semibold text-primary-foreground">
              New
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="gap-5 px-4 pb-12"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — web KodeDashboard greeting + starter prompts */}
        <FadeInUp>
          <View className="pt-2">
            <View className="flex-row items-center gap-1.5">
              <Icon as={Code2} size={13} className="text-primary" />
              <Text className="text-[11px] font-semibold uppercase tracking-[2.5px] text-primary">
                Kode
              </Text>
            </View>
            <Text className="mt-2 text-[28px] font-semibold leading-9 tracking-tight text-foreground">
              What should we build, {firstName}?
            </Text>
            <Text className="mt-2 text-[13.5px] leading-5 text-muted-foreground">
              Describe an app or site. Kode builds it, previews it live and hands
              you the full source.
            </Text>
            <View className="mt-4 gap-2">
              {STARTERS.map((starter) => (
                <Pressable
                  key={starter}
                  accessibilityRole="button"
                  onPress={() => {
                    setPrompt(starter);
                    setComposerOpen(true);
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border border-foreground/8 bg-foreground/3 px-3.5 py-3 active:bg-foreground/7"
                >
                  <Icon as={Sparkles} size={14} className="text-primary" />
                  <Text className="flex-1 text-[13px] leading-[18px] text-foreground/90">
                    {starter}
                  </Text>
                  <Icon as={ArrowUpRight} size={14} className="text-muted-foreground/60" />
                </Pressable>
              ))}
            </View>
          </View>
        </FadeInUp>

        {credits ? (
          <View className="flex-row gap-2">
            <Metric label="Credits left" value={credits.remaining} />
            <Metric
              label="Builds this month"
              value={`${credits.buildsUsed}/${credits.buildLimit}`}
            />
          </View>
        ) : (
          <View className="h-[74px] rounded-2xl bg-foreground/5" />
        )}

        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[15px] font-semibold text-foreground">
              Your projects
            </Text>
            <Text className="text-[11.5px] text-muted-foreground">
              {projects?.length ?? 0} project{projects?.length === 1 ? "" : "s"}
            </Text>
          </View>
          {projects === undefined ? (
            <View className="gap-3">
              {[1, 2].map((item) => (
                <View key={item} className="h-56 rounded-[22px] bg-foreground/5" />
              ))}
            </View>
          ) : projects.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setComposerOpen(true)}
              className="items-center rounded-[22px] border border-dashed border-foreground/15 px-5 py-12 active:bg-foreground/4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <Icon as={FileCode2} size={21} className="text-primary" />
              </View>
              <Text className="mt-4 text-[15px] font-semibold text-foreground">
                Create your first project
              </Text>
              <Text className="mt-1.5 text-center text-[12.5px] leading-[18px] text-muted-foreground">
                Describe what you want to build and Kode will prepare the
                workspace.
              </Text>
            </Pressable>
          ) : (
            <View className="gap-3">
              {projects.map((project) => (
                <KodeProjectCard
                  key={project._id}
                  project={project}
                  onPress={() => openWorkspace(project._id)}
                />
              ))}
            </View>
          )}
        </View>
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
          <View className="rounded-t-[28px] border-t border-foreground/10 bg-popover px-5 pb-10 pt-3">
            <View className="mb-3 items-center">
              <View className="h-1 w-10 rounded-full bg-foreground/15" />
            </View>
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
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5"
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
              textAlignVertical="top"
              className="min-h-32 rounded-2xl border border-foreground/5 bg-foreground/4 px-4 py-3 text-[14.5px] leading-[21px] text-foreground"
            />
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Attach code or text files"
                onPress={() => void attachFiles()}
                className="min-h-10 flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/5 px-3.5 active:bg-foreground/10"
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
                        : "border-foreground/8 bg-foreground/4",
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
                "mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl",
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
    <View className="flex-1 rounded-2xl border border-foreground/8 bg-card p-4">
      <Text className="text-[20px] font-semibold tracking-tight text-foreground">{value}</Text>
      <Text className="mt-1 text-[11.5px] text-muted-foreground">{label}</Text>
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  building: "Building",
  ready: "Ready",
  error: "Needs attention",
};

/** Web KodeProjectCard: mini browser preview, version pill, title, status. */
function KodeProjectCard({
  project,
  onPress,
}: {
  project: Doc<"kodeWebProjects">;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const building = project.status === "building";
  const failed = project.status === "error";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${project.title}`}
      onPress={onPress}
      className="overflow-hidden rounded-[22px] border border-foreground/8 bg-card active:opacity-90"
    >
      <View
        className="h-36 overflow-hidden border-b border-foreground/8"
        style={{ backgroundColor: tokens.muted }}
      >
        <View
          className="absolute overflow-hidden rounded-lg border border-foreground/10 bg-background"
          style={{ left: "9%", right: "9%", top: "14%", bottom: "-10%" }}
        >
          <View className="h-5 flex-row items-center gap-1 border-b border-foreground/8 px-2">
            <View className="h-1.5 w-1.5 rounded-full bg-primary/75" />
            <View className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
            <View className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
          </View>
          <View className="flex-1 flex-row gap-2 p-2">
            <View className="w-[28%] rounded bg-foreground/4" />
            <View className="flex-1 gap-2 pt-1">
              <View className="h-2 w-3/5 rounded-full bg-primary/55" />
              <View className="h-1.5 w-4/5 rounded-full bg-foreground/10" />
              <View className="flex-row gap-1.5 pt-1">
                <View className="h-8 flex-1 rounded bg-foreground/5" />
                <View className="h-8 flex-1 rounded bg-foreground/5" />
              </View>
            </View>
          </View>
        </View>
        <View className="absolute right-3 top-3 flex-row items-center gap-1.5 rounded-full border border-foreground/10 bg-background/80 px-2 py-1">
          <Icon
            as={building ? LoaderCircle : Code2}
            size={11}
            className={building ? "text-primary" : "text-muted-foreground"}
          />
          <Text className="text-[10px] font-medium text-muted-foreground">
            {building ? "Building" : `v${project.activeVersion}`}
          </Text>
        </View>
      </View>
      <View className="flex-row items-start gap-3 p-4">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="shrink text-[14.5px] font-semibold tracking-tight text-foreground">
              {project.title}
            </Text>
            {project.starred ? (
              <Icon as={Star} size={13} className="text-primary" fill={tokens.primary} />
            ) : null}
          </View>
          {project.description ? (
            <Text numberOfLines={2} className="mt-1 text-[12px] leading-[17px] text-muted-foreground">
              {project.description}
            </Text>
          ) : null}
          <View className="mt-2.5 flex-row items-center gap-1.5">
            <View
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                failed ? "bg-destructive" : building ? "bg-primary" : "bg-muted-foreground/60",
              )}
            />
            <Text
              className={cn(
                "text-[11px] font-medium",
                failed ? "text-destructive" : building ? "text-primary" : "text-muted-foreground",
              )}
            >
              {STATUS_LABEL[project.status] ?? "Draft"}
            </Text>
          </View>
        </View>
        <Icon as={ArrowUpRight} size={16} className="text-muted-foreground/60" />
      </View>
    </Pressable>
  );
}
