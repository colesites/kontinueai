import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAuth } from "@clerk/expo";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc, Id } from "@repo/convex/convex/_generated/dataModel";
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  type CanvasModel,
} from "@repo/ai/lib/canvas-models";
import {
  ArrowUp,
  Check,
  Clapperboard,
  Coins,
  Globe,
  GlobeLock,
  Heart,
  ImageIcon,
  Paperclip,
  PanelLeft,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";

import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/theme-provider";
import {
  Dropdown,
  DropdownItem,
  useDropdown,
} from "@/components/ui/dropdown";
import { GlassView } from "@/components/ui/glass";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { API_BASE_URL } from "@/lib/chat-api";
import { pickReferenceImage, type PendingAttachment } from "@/lib/chat-attachments";
import { cn } from "@/lib/utils";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const DURATIONS = [5, 10] as const;

type Creation = Doc<"canvasCreations">;
type Mode = "image" | "video";

function aspectToNumber(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return 1;
  return w / h;
}

export default function CanvasScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const { openSidebar } = useSidebar();
  const router = useRouter();
  const { isDark, primary, mutedForeground, primaryForeground } = useTheme();
  const planTier = usePlanTier();
  const isPaidPlan = planTier !== "free";
  const canGenerateVideos = planTier === "pro";

  const [tab, setTab] = useState<"community" | "mine">("community");
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [imageModelId, setImageModelId] = useState(IMAGE_MODELS[0]?.id ?? "");
  const [videoModelId, setVideoModelId] = useState(VIDEO_MODELS[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [duration, setDuration] = useState<number>(5);
  const [quality, setQuality] = useState<"standard" | "pro">("standard");
  const [isGenerating, setIsGenerating] = useState(false);
  const modeMenu = useDropdown();
  const modelMenu = useDropdown();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Creation | null>(null);
  const [activeVideoJobId, setActiveVideoJobId] = useState<Id<"videoJobs"> | null>(null);
  // img2img: optional photo the generation transforms / takes style from.
  const [referenceImage, setReferenceImage] = useState<PendingAttachment | null>(null);

  const community = usePaginatedQuery(
    api.canvas.listPublished,
    { sortBy: "likes" },
    { initialNumItems: 24 },
  );
  const mine = usePaginatedQuery(api.canvas.listMyCreations, {}, { initialNumItems: 24 });
  const myLikes = useQuery(api.canvas.getMyLikes, {});
  const credits = useQuery(api.canvas.getCredits, {});
  const activeJob = useQuery(
    api.videoJobs.getVideoJob,
    activeVideoJobId ? { jobId: activeVideoJobId } : "skip",
  );
  const toggleLike = useMutation(api.canvas.toggleLike);
  const createCreation = useMutation(api.canvas.createCreation);
  const publishCreation = useMutation(api.canvas.publishCreation);
  const deleteCreation = useMutation(api.canvas.deleteCreation);
  const deductCredits = useMutation(api.canvas.deductCredits);

  const likedIds = useMemo(() => new Set(myLikes ?? []), [myLikes]);
  const feed = tab === "community" ? community : mine;
  const models = mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const modelId = mode === "image" ? imageModelId : videoModelId;
  const selectedModel = models.find((m) => m.id === modelId);

  const jobDone = activeJob?.status === "completed" || activeJob?.status === "failed";

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (text.length < 3 || isGenerating || !selectedModel) return;
    const isFree = selectedModel.isFree ?? false;

    if (mode === "image" && !isPaidPlan && !isFree) {
      Alert.alert("Upgrade required", "Upgrade to Starter or Pro to use this model — K-Image 1.0 is free for everyone.");
      return;
    }
    if (mode === "video" && !canGenerateVideos && !isFree) {
      Alert.alert("Pro required", "Video generation needs the Pro plan.");
      return;
    }
    if (mode === "video" && !isFree) {
      const multiplier = quality === "pro" ? 20 : 15;
      const cost = duration * multiplier;
      if (!credits || credits.remaining < cost) {
        Alert.alert(
          "Not enough credits",
          `You have ${credits?.remaining ?? 0} credits remaining and this render needs ${cost}.`,
        );
        return;
      }
    }

    setIsGenerating(true);
    try {
      const token = await getToken();
      const endpoint =
        mode === "image" ? "/api/canvas/generate-image" : "/api/canvas/generate-video";
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: text,
          model: modelId,
          aspectRatio,
          ...(mode === "image" && referenceImage && { image: referenceImage.dataUrl }),
          ...(mode === "video" && { duration, quality }),
        }),
      });
      const data = (await response.json()) as {
        mediaUrl?: string;
        pathname?: string;
        async?: boolean;
        jobId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Generation failed");

      // Long-form K-Video renders asynchronously on the worker; the finished
      // clip lands in the gallery automatically. Credits are charged up front.
      if (data.async) {
        if (mode === "video" && !isFree) {
          await deductCredits({ seconds: duration, modelId, quality });
        }
        if (data.jobId) setActiveVideoJobId(data.jobId as Id<"videoJobs">);
        setPrompt("");
        setTab("mine");
        return;
      }

      if (!data.mediaUrl) throw new Error("Generation failed");
      if (mode === "video" && !isFree) {
        await deductCredits({ seconds: duration, modelId, quality });
      }
      await createCreation({
        mediaType: mode,
        mediaUrl: data.mediaUrl,
        pathname: data.pathname ?? data.mediaUrl,
        prompt: text,
        modelId,
        aspectRatio,
        ...(mode === "video" && { duration, quality }),
      });
      setPrompt("");
      setReferenceImage(null);
      setTab("mine");
    } catch (err) {
      Alert.alert(
        "Generation failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePickReference = async () => {
    try {
      const picked = await pickReferenceImage();
      if (picked) setReferenceImage(picked);
    } catch (err) {
      Alert.alert(
        "Couldn't pick image",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const handleToggleLike = (creationId: Id<"canvasCreations">) => {
    toggleLike({ creationId }).catch(() => {
      Alert.alert("Couldn't update like", "Please try again.");
    });
  };

  const handleDelete = (creation: Creation) => {
    Alert.alert("Delete creation?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setExpanded(null);
          deleteCreation({ creationId: creation._id }).catch(() =>
            Alert.alert("Couldn't delete", "Please try again."),
          );
        },
      },
    ]);
  };

  const handleTogglePublish = (creation: Creation) => {
    publishCreation({ creationId: creation._id })
      .then(({ isPublished }) => {
        setExpanded((prev) =>
          prev && prev._id === creation._id ? { ...prev, isPublished } : prev,
        );
      })
      .catch(() => Alert.alert("Couldn't update visibility", "Please try again."));
  };

  const columnWidth = (windowWidth - 16 * 2 - 10) / 2;

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      {/* Floating top controls — mirrors web AppShell on /canvas */}
      <View className="flex-row items-center justify-between px-3 py-2">
        <View className="flex-row items-center gap-2">
          {/* Standard icons pill */}
          <View className="flex-row items-center gap-1 rounded-2xl border border-border p-1">
            <ToolbarButton label="Open sidebar" icon={PanelLeft} onPress={openSidebar} />
            <ToolbarButton label="Search" icon={Search} onPress={openSidebar} />
            <ToolbarButton label="New chat" icon={Plus} onPress={() => router.push("/")} />
          </View>

          {/* Community / My Creations switcher */}
          <View className="flex-row items-center gap-1 rounded-2xl border border-border p-1">
            {(["community", "mine"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                className={cn(
                  "rounded-xl px-3 py-1.5",
                  tab === t && "bg-foreground/8",
                )}
              >
                <Text
                  className={cn(
                    "text-[11.5px] font-semibold",
                    tab === t ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t === "community" ? "Community" : "My Creations"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="rounded-2xl border border-border p-1">
          <ModeToggle />
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Async video job banner */}
        {activeVideoJobId && activeJob && !jobDone ? (
          <View className="mx-4 mb-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="flex-1 text-[12.5px] text-foreground">
                Rendering video… {Math.round(activeJob.progress ?? 0)}%
                {activeJob.stage ? ` · ${activeJob.stage}` : ""}
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, Math.min(100, activeJob.progress ?? 0))}%` }}
              />
            </View>
          </View>
        ) : null}
        {activeJob?.status === "failed" ? (
          <View className="mx-4 mb-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5">
            <Text className="text-[12.5px] text-destructive">
              Video render failed{activeJob.error ? `: ${activeJob.error}` : "."}
            </Text>
          </View>
        ) : null}

        {/* Gallery */}
        {feed.results.length === 0 && feed.status !== "LoadingFirstPage" ? (
          <View className="flex-1 items-center justify-center px-8">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Icon as={Sparkles} size={24} className="text-primary" />
            </View>
            <Text className="mt-4 text-[17px] font-semibold text-foreground">
              Nothing here yet
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
              {tab === "community"
                ? "Be the first to publish — community creations will show up here soon."
                : "Generate your first creation below — it will land here."}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerClassName="px-4 pb-4"
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const nearBottom =
                layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
              if (nearBottom && feed.status === "CanLoadMore") {
                feed.loadMore(24);
              }
            }}
            scrollEventThrottle={200}
          >
            <View className="flex-row gap-2.5">
              {[0, 1].map((col) => (
                <View key={col} className="flex-1 gap-2.5">
                  {feed.results
                    .filter((_, i) => i % 2 === col)
                    .map((creation) => (
                      <CreationCard
                        key={creation._id}
                        creation={creation}
                        width={columnWidth}
                        liked={likedIds.has(creation._id)}
                        onPress={() => setExpanded(creation)}
                        onLike={() => handleToggleLike(creation._id)}
                      />
                    ))}
                </View>
              ))}
            </View>
            {feed.status === "LoadingFirstPage" || feed.status === "LoadingMore" ? (
              <View className="py-6">
                <ActivityIndicator size="small" />
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Canvas input bar — mirrors web CanvasInputBar (floating glass card) */}
        <View className="px-3 pb-4">
          <View
            style={{
              borderRadius: 28,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
          <GlassView
            intensity={36}
            style={{
              borderRadius: 28,
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
              backgroundColor: isDark ? "rgba(12,9,12,0.40)" : "rgba(255,251,253,0.40)",
            }}
          >
            {/* Attached reference photo strip */}
            {referenceImage && mode === "image" ? (
              <View className="flex-row items-center gap-2.5 px-4 pt-3">
                <View className="relative">
                  <Image
                    source={{ uri: referenceImage.uri }}
                    style={{ width: 48, height: 48, borderRadius: 12 }}
                    contentFit="cover"
                  />
                  <Pressable
                    hitSlop={6}
                    onPress={() => setReferenceImage(null)}
                    className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-foreground/80"
                  >
                    <Icon as={X} size={11} className="text-background" />
                  </Pressable>
                </View>
                <Text className="flex-1 text-[11.5px] leading-4 text-muted-foreground">
                  Reference photo — works best with Gemini and GPT image models.
                </Text>
              </View>
            ) : null}

            {/* Prompt row: paperclip · textarea · round submit */}
            <View className="flex-row items-end gap-2 px-3 pb-1 pt-2">
              <Pressable
                accessibilityLabel="Attach reference photo"
                onPress={() => void handlePickReference()}
                className="mb-1 h-10 w-10 items-center justify-center rounded-full active:bg-foreground/8"
              >
                <Icon
                  as={Paperclip}
                  size={19}
                  className={referenceImage ? "text-primary" : "text-muted-foreground"}
                />
              </Pressable>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="What do you want to create?"
                placeholderTextColor={mutedForeground}
                multiline
                className="max-h-28 min-h-12 flex-1 py-3 text-[15.5px] leading-5 text-foreground"
              />
              <Pressable
                disabled={prompt.trim().length < 3 || isGenerating}
                onPress={() => void handleGenerate()}
                className={cn(
                  "mb-1 h-11 w-11 items-center justify-center rounded-full",
                  prompt.trim().length >= 3 && !isGenerating
                    ? "bg-primary active:opacity-90"
                    : "bg-foreground/8",
                )}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color={primaryForeground} />
                ) : (
                  <Icon
                    as={ArrowUp}
                    size={22}
                    className={
                      prompt.trim().length >= 3 ? "text-primary-foreground" : "text-muted-foreground"
                    }
                  />
                )}
              </Pressable>
            </View>

            {/* Controls row: mode · settings | model · credits */}
            <View className="flex-row items-center gap-1.5 border-t border-border/30 px-3 py-2.5">
              <Pressable
                onPress={modeMenu.open}
                className="flex-row items-center gap-1.5 rounded-full border border-foreground/8 bg-foreground/5 px-3 py-2 active:opacity-80"
              >
                <Icon
                  as={mode === "image" ? ImageIcon : Clapperboard}
                  size={13}
                  className="text-foreground"
                />
                <Text className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                  {mode}
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Generation settings"
                onPress={() => setSettingsOpen(true)}
                className="h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:opacity-80"
              >
                <Icon as={SlidersHorizontal} size={14} className="text-muted-foreground" />
              </Pressable>

              <View className="mx-1 h-5 w-px bg-foreground/10" />

              <Pressable
                onPress={modelMenu.open}
                className="flex-row items-center gap-1.5 rounded-full border border-foreground/8 bg-foreground/5 px-3 py-2 active:opacity-80"
              >
                <Text
                  numberOfLines={1}
                  className="max-w-36 text-[11px] font-bold uppercase tracking-wide text-foreground"
                >
                  {selectedModel?.name ?? "Model"}
                </Text>
              </Pressable>

              <View className="flex-1" />

              {mode === "video" && !selectedModel?.isFree ? (
                <View className="flex-row items-center gap-1">
                  <Icon as={Coins} size={12} className="text-muted-foreground" />
                  <Text className="text-[11px] text-muted-foreground">
                    {credits ? `${credits.remaining}` : "…"}
                  </Text>
                </View>
              ) : null}
            </View>
          </GlassView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Generation settings sheet (aspect ratio / duration / quality) */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setSettingsOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl border border-b-0 border-border bg-popover px-5 pb-10 pt-4"
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[17px] font-semibold text-foreground">
                {mode === "image" ? "Image settings" : "Video settings"}
              </Text>
              <Pressable
                onPress={() => setSettingsOpen(false)}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full bg-foreground/5"
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>

            {mode === "image" ? (
              <>
                <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Aspect ratio
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {ASPECT_RATIOS.map((ratio) => (
                    <Pressable
                      key={ratio}
                      onPress={() => setAspectRatio(ratio)}
                      className={cn(
                        "rounded-full px-4 py-2",
                        aspectRatio === ratio
                          ? "bg-primary/15 border border-primary/40"
                          : "border border-foreground/8 bg-foreground/5",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-[13px] font-medium",
                          aspectRatio === ratio ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {ratio}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Duration
                </Text>
                <View className="mb-4 flex-row gap-1.5">
                  {DURATIONS.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setDuration(d)}
                      className={cn(
                        "rounded-full px-4 py-2",
                        duration === d
                          ? "bg-primary/15 border border-primary/40"
                          : "border border-foreground/8 bg-foreground/5",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-[13px] font-medium",
                          duration === d ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {d}s
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Quality
                </Text>
                <View className="flex-row gap-1.5">
                  {(["standard", "pro"] as const).map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => setQuality(q)}
                      className={cn(
                        "rounded-full px-4 py-2",
                        quality === q
                          ? "bg-primary/15 border border-primary/40"
                          : "border border-foreground/8 bg-foreground/5",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-[13px] font-medium capitalize",
                          quality === q ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {q}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {!selectedModel?.isFree ? (
                  <Text className="mt-4 text-[12px] leading-4 text-muted-foreground">
                    {credits
                      ? `${credits.remaining} of ${credits.total} credits left · this render costs ${duration * (quality === "pro" ? 20 : 15)}`
                      : "Loading credits…"}
                    {!canGenerateVideos ? " · Pro plan required" : ""}
                  </Text>
                ) : null}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Model dropdown — mirrors web PillSelect */}
      <Dropdown
        visible={modelMenu.visible}
        anchor={modelMenu.anchor}
        onClose={modelMenu.close}
        placement="above"
        width={232}
      >
        {models.map((model: CanvasModel) => {
          const active = model.id === modelId;
          const locked =
            mode === "image"
              ? !isPaidPlan && !model.isFree
              : !canGenerateVideos && !model.isFree;
          return (
            <DropdownItem
              key={model.id}
              label={model.name}
              active={active}
              disabled={locked}
              onPress={() => {
                if (mode === "image") setImageModelId(model.id);
                else setVideoModelId(model.id);
                modelMenu.close();
              }}
              trailing={
                active ? (
                  <Icon as={Check} size={14} className="text-primary" />
                ) : locked ? (
                  <Text className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {mode === "video" ? "Pro" : "Paid"}
                  </Text>
                ) : undefined
              }
            />
          );
        })}
      </Dropdown>

      {/* Mode dropdown (Image / Video) — mirrors web's Type PillSelect */}
      <Dropdown
        visible={modeMenu.visible}
        anchor={modeMenu.anchor}
        onClose={modeMenu.close}
        placement="above"
        width={160}
      >
        <DropdownItem
          icon={ImageIcon}
          label="Image"
          active={mode === "image"}
          onPress={() => {
            setMode("image");
            modeMenu.close();
          }}
          trailing={mode === "image" ? <Icon as={Check} size={14} className="text-primary" /> : undefined}
        />
        <DropdownItem
          icon={Clapperboard}
          label="Video"
          active={mode === "video"}
          onPress={() => {
            setMode("video");
            modeMenu.close();
          }}
          trailing={mode === "video" ? <Icon as={Check} size={14} className="text-primary" /> : undefined}
        />
      </Dropdown>

      {/* Lightbox */}
      <Modal
        visible={expanded !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExpanded(null)}
      >
        <Pressable className="flex-1 justify-center bg-black/85 px-4" onPress={() => setExpanded(null)}>
          {expanded ? (
            <Pressable onPress={(e) => e.stopPropagation()}>
              {expanded.mediaType === "video" ? (
                <VideoLightbox creation={expanded} />
              ) : (
                <Image
                  source={{ uri: expanded.mediaUrl }}
                  style={{
                    width: "100%",
                    aspectRatio: aspectToNumber(expanded.aspectRatio),
                    borderRadius: 16,
                  }}
                  contentFit="contain"
                />
              )}
              <View className="mt-4 rounded-2xl border border-border bg-popover p-4">
                <Text className="text-[13.5px] leading-5 text-foreground/90">
                  {expanded.prompt}
                </Text>
                <View className="mt-3 flex-row items-center gap-2">
                  <Pressable
                    onPress={() => handleToggleLike(expanded._id)}
                    className="flex-row items-center gap-1.5 rounded-full bg-secondary px-3 py-2 active:opacity-80"
                  >
                    <Icon
                      as={Heart}
                      size={14}
                      color={likedIds.has(expanded._id) ? primary : undefined}
                      className={likedIds.has(expanded._id) ? undefined : "text-muted-foreground"}
                    />
                    <Text className="text-[12.5px] font-medium text-foreground">
                      {expanded.likeCount}
                    </Text>
                  </Pressable>
                  {tab === "mine" ? (
                    <>
                      <Pressable
                        onPress={() => handleTogglePublish(expanded)}
                        className="flex-row items-center gap-1.5 rounded-full bg-secondary px-3 py-2 active:opacity-80"
                      >
                        <Icon
                          as={expanded.isPublished ? GlobeLock : Globe}
                          size={14}
                          className="text-muted-foreground"
                        />
                        <Text className="text-[12.5px] font-medium text-foreground">
                          {expanded.isPublished ? "Unpublish" : "Publish"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(expanded)}
                        className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-2 active:opacity-80"
                      >
                        <Icon as={Trash2} size={14} className="text-destructive" />
                        <Text className="text-[12.5px] font-medium text-destructive">Delete</Text>
                      </Pressable>
                    </>
                  ) : null}
                  <View className="flex-1" />
                  <Pressable
                    onPress={() => setExpanded(null)}
                    className="h-9 w-9 items-center justify-center rounded-full bg-secondary active:opacity-80"
                  >
                    <Icon as={X} size={15} className="text-muted-foreground" />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ToolbarButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: typeof Plus;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="h-8 w-8 items-center justify-center rounded-full active:bg-foreground/8"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

function VideoLightbox({ creation }: { creation: Creation }) {
  const player = useVideoPlayer(creation.mediaUrl, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{
        width: "100%",
        aspectRatio: aspectToNumber(creation.aspectRatio),
        borderRadius: 16,
      }}
      contentFit="contain"
      nativeControls
    />
  );
}

function CreationCard({
  creation,
  width,
  liked,
  onPress,
  onLike,
}: {
  creation: Creation;
  width: number;
  liked: boolean;
  onPress: () => void;
  onLike: () => void;
}) {
  const { primary } = useTheme();
  const height = width / aspectToNumber(creation.aspectRatio);
  return (
    <Pressable onPress={onPress} className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-90">
      {creation.mediaType === "video" ? (
        <View
          className="items-center justify-center bg-black/40"
          style={{ width: "100%", height: Math.min(height, width * 1.4) }}
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/15">
            <Icon as={Play} size={20} color="#fff" />
          </View>
        </View>
      ) : (
        <Image
          source={{ uri: creation.mediaUrl }}
          style={{ width: "100%", height }}
          contentFit="cover"
          transition={150}
        />
      )}
      <View className="flex-row items-center justify-between px-2.5 py-2">
        <Text numberOfLines={1} className="flex-1 pr-2 text-[11.5px] text-muted-foreground">
          {creation.ownerName ?? "Anonymous"}
        </Text>
        <Pressable
          hitSlop={6}
          onPress={onLike}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Icon
            as={Heart}
            size={13}
            color={liked ? primary : undefined}
            className={liked ? undefined : "text-muted-foreground"}
          />
          <Text className="text-[11.5px] text-muted-foreground">{creation.likeCount}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
