import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "expo-router";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@clerk/expo";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Doc, Id } from "@repo/convex/convex/_generated/dataModel";
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  formatDuration,
  getCanvasModelById,
  IMAGE_MODELS,
  isDurationSupported,
  isRatioSupported,
  K_VIDEO_MODEL_ID,
  kVideoAllowedResolutions,
  kVideoDurationsForTier,
  maxReferenceImagesFor,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  type CanvasModel,
} from "@repo/ai/lib/canvas-models";
import { appError } from "@repo/core/app-errors";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import { nextPlanWithMore, PLAN_DEFINITIONS } from "@repo/core/plan-config";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clapperboard,
  Coins,
  Download,
  Globe,
  GlobeLock,
  Heart,
  ImageIcon,
  Lock,
  Paperclip,
  Play,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";

import { withAlpha } from "@/components/chat/markdown";
import { useTheme } from "@/components/theme-provider";
import { GlassPill, TopToolbar } from "@/components/top-toolbar";
import { GlowButton } from "@/components/ui/glow-button";
import { GlowRail } from "@/components/ui/glow-rail";
import {
  Dropdown,
  DropdownItem,
  useDropdown,
} from "@/components/ui/dropdown";
import { GlassView } from "@/components/ui/glass";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { AppError, readApiError, showAppErrorToast } from "@/lib/app-errors";
import { API_BASE_URL } from "@/lib/chat-api";
import { shareMediaFile } from "@/lib/media-share";
import { cn } from "@/lib/utils";
import { softShadow } from "@/lib/shadow";

type Creation = Doc<"canvasCreations">;
type Mode = "image" | "video";
type ReferenceImage = { id: string; url: string; previewUri: string };

function aspectToNumber(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return 1;
  return w / h;
}

/** Credits per second of video, same table as web's useCanvasInput. */
function videoCostMultiplier(
  model: CanvasModel | undefined,
  quality: "standard" | "pro",
  resolution: string,
): number {
  if (!model || model.isFree) return 0;
  if (model.id.includes("kling")) return quality === "pro" ? 20 : 15;
  if (resolution.includes("1080")) return 20;
  if (resolution.includes("720")) return 15;
  if (resolution.includes("480")) return 10;
  return 15;
}

export default function CanvasScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { getToken } = useAuth();
  const { open: sidebarOpen } = useSidebar();
  const router = useRouter();
  const { isDark, primary, mutedForeground, primaryForeground, tokens } = useTheme();
  const planTier = usePlanTier();
  // Header and input bar float over the gallery (web AppShell / CanvasInputBar).
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 104);
  const [inputHeight, setInputHeight] = useState(150);
  const plan = PLAN_DEFINITIONS[planTier];

  const [tab, setTab] = useState<"community" | "mine">("community");
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [imageModelId, setImageModelId] = useState(DEFAULT_IMAGE_MODEL);
  const [videoModelId, setVideoModelId] = useState(DEFAULT_VIDEO_MODEL);
  const [preferredRatio, setPreferredRatio] = useState<string>("3:2");
  const [preferredDuration, setPreferredDuration] = useState<number>(5);
  const [preferredResolution, setPreferredResolution] = useState<string>("");
  const [quality, setQuality] = useState<"standard" | "pro">("standard");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const tabMenu = useDropdown();
  const [inputFocused, setInputFocused] = useState(false);
  const modelMenu = useDropdown();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Creation | null>(null);
  const [activeVideoJobId, setActiveVideoJobId] = useState<Id<"videoJobs"> | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);

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

  // Same policy as web useCanvas: Canvas is a Pro/Max feature; video also
  // unlocks while referral-bonus credits remain. Free models (K-Image) stay
  // open to everyone.
  const isPro = canAccessPlanFeature(planTier, "canvas");
  const canGenerateImages = isPro;
  const bonusRemaining = credits?.bonus?.remaining ?? 0;
  const canGenerateVideos = isPro || bonusRemaining > 0;
  const creditsAvailable = credits?.available ?? 0;

  const likedIds = useMemo(() => new Set(myLikes ?? []), [myLikes]);
  const feed = tab === "community" ? community : mine;
  const models = mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const modelId = mode === "image" ? imageModelId : videoModelId;
  const selectedModel = getCanvasModelById(modelId);
  const provider = selectedModel?.provider ?? "";
  const isFreeModel = selectedModel?.isFree ?? false;
  const isKVideo = modelId === K_VIDEO_MODEL_ID;

  // Options the current model (and plan) actually supports. The preferred
  // value is kept and the effective one falls back, so switching back to a
  // model restores the person's choice.
  const ratioOptions = ASPECT_RATIOS.filter((r) => isRatioSupported(provider, r.value));
  const aspectRatio = ratioOptions.some((r) => r.value === preferredRatio)
    ? preferredRatio
    : (ratioOptions[0]?.value ?? "1:1");
  const resolutionOptions = isKVideo
    ? kVideoAllowedResolutions(planTier)
    : (selectedModel?.resolutions ?? []);
  const resolution = resolutionOptions.some((r) => r.value === preferredResolution)
    ? preferredResolution
    : (resolutionOptions[0]?.value ?? "");
  const costMultiplier = videoCostMultiplier(selectedModel, quality, resolution);
  const durationOptions: number[] = isKVideo
    ? kVideoDurationsForTier(planTier)
    : VIDEO_DURATIONS.filter(
        (d) =>
          isDurationSupported(modelId, d) &&
          (isFreeModel || d * costMultiplier <= Math.max(creditsAvailable, 5 * costMultiplier)),
      );
  const duration = durationOptions.includes(preferredDuration)
    ? preferredDuration
    : (durationOptions[0] ?? 5);
  const videoCost = mode === "video" ? duration * costMultiplier : 0;
  const maxImages = maxReferenceImagesFor(selectedModel, plan.canvasReferenceImages);
  const visibleReferences = referenceImages.slice(0, maxImages);
  const maxChars = modelId.includes("wan") ? 500 : modelId.includes("kling") ? 2500 : undefined;
  const modeLocked = !isFreeModel && (mode === "image" ? !canGenerateImages : !canGenerateVideos);
  const canSubmit =
    prompt.trim().length >= 3 &&
    !isGenerating &&
    !isUploading &&
    (!maxChars || prompt.trim().length <= maxChars);

  const jobDone = activeJob?.status === "completed" || activeJob?.status === "failed";

  const upgradeToast = (title: string, message: string) =>
    showAppErrorToast(appError("PLAN_REQUIRED", { title, message, upgradeTo: "pro" }));

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!canSubmit || !selectedModel) return;

    // Same rules the server applies, so people see why before waiting.
    if (mode === "image" && !canGenerateImages && !isFreeModel) {
      upgradeToast(
        "Canvas is a Pro feature",
        "Image and video generation in Canvas comes with Pro and Max. K-Image 1.0 stays free for everyone.",
      );
      return;
    }
    if (mode === "video" && !canGenerateVideos && !isFreeModel) {
      upgradeToast(
        "Video is a Pro feature",
        "Video generation in Canvas comes with Pro and Max. Upgrade to start creating videos.",
      );
      return;
    }
    if (mode === "video" && !isFreeModel && creditsAvailable < videoCost) {
      showAppErrorToast(
        appError("CREDITS_EXHAUSTED", {
          message: `This video needs ${videoCost} credits and you have ${creditsAvailable}. Try a shorter clip or a lower resolution.`,
        }),
      );
      return;
    }

    setIsGenerating(true);
    const loadingId = toast.loading(
      mode === "image" ? "Generating image…" : `Generating ${formatDuration(duration)} video…`,
    );
    const imageUrls = visibleReferences.map((ref) => ref.url);
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
          resolution: resolution || undefined,
          ...(imageUrls.length > 0 && { images: imageUrls, image: imageUrls[0] }),
          ...(mode === "video" && { duration, quality }),
        }),
      });
      if (!response.ok) throw new AppError(await readApiError(response));
      const data = (await response.json()) as {
        mediaUrl?: string;
        pathname?: string;
        async?: boolean;
        jobId?: string;
      };

      // Credits are charged by the generate route itself; the client never
      // deducts (doing both double-charged every video).
      if (data.async) {
        if (data.jobId) setActiveVideoJobId(data.jobId as Id<"videoJobs">);
        toast.success("Video is rendering", {
          id: loadingId,
          description: "It lands in My Creations when it's ready.",
        });
        setPrompt("");
        setReferenceImages([]);
        setTab("mine");
        return;
      }

      if (!data.mediaUrl || !data.pathname) {
        throw new AppError(
          appError("UNKNOWN", {
            message: "The generation finished but no file came back. Please try again.",
          }),
        );
      }
      await createCreation({
        mediaType: mode,
        mediaUrl: data.mediaUrl,
        pathname: data.pathname,
        prompt: text,
        modelId,
        aspectRatio,
        resolution: resolution || undefined,
        ...(imageUrls[0] && { referenceImageUrl: imageUrls[0] }),
        ...(mode === "video" && { duration, quality }),
      });
      toast.success(`${mode === "image" ? "Image" : "Video"} generated`, {
        id: loadingId,
      });
      setPrompt("");
      setReferenceImages([]);
      setTab("mine");
    } catch (err) {
      toast.dismiss(loadingId);
      showAppErrorToast(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Reference images upload first (the route only accepts hosted URLs), up to
  // the plan allowance capped by what the model accepts — web parity.
  const handlePickReferences = async () => {
    if (maxImages === 0) {
      showAppErrorToast(
        plan.canvasReferenceImages === 0
          ? appError("PLAN_REQUIRED", {
              title: "Reference images need Pro",
              message: "Using your own images in Canvas comes with Pro and Max.",
              upgradeTo: "pro",
            })
          : appError("INVALID_REQUEST", {
              title: "Not supported by this model",
              message: "This model doesn't take reference images. Pick another model to use one.",
            }),
      );
      return;
    }
    const slots = maxImages - visibleReferences.length;
    if (slots <= 0) {
      const planIsCap = maxImages >= plan.canvasReferenceImages;
      const upgradeTo = planIsCap
        ? nextPlanWithMore(planTier, (p) => p.canvasReferenceImages)
        : undefined;
      showAppErrorToast(
        appError("USAGE_LIMIT_REACHED", {
          title: "Image limit reached",
          message: `You can use up to ${maxImages} reference image${maxImages === 1 ? "" : "s"} with this model on ${plan.name}.`,
          upgradeTo,
        }),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: slots > 1,
      selectionLimit: slots,
      quality: 0.85,
    });
    if (result.canceled) return;

    const accepted = result.assets.filter((asset) => {
      if (asset.fileSize && asset.fileSize > plan.maxChatUploadBytes) {
        const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
        showAppErrorToast(
          appError("PLAN_REQUIRED", {
            title: "Image too large",
            message: `${asset.fileName ?? "That image"} is ${mb(asset.fileSize)}MB. ${plan.name} allows up to ${mb(plan.maxChatUploadBytes)}MB per file.`,
            upgradeTo: nextPlanWithMore(planTier, (p) => p.maxChatUploadBytes),
          }),
        );
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return;

    setIsUploading(true);
    try {
      const token = await getToken();
      const uploaded = await Promise.all(
        accepted.slice(0, slots).map(async (asset): Promise<ReferenceImage | null> => {
          const filename = asset.fileName ?? `reference-${Date.now()}.jpg`;
          try {
            const upload = await FileSystem.uploadAsync(
              `${API_BASE_URL}/api/files/upload?filename=${encodeURIComponent(filename)}`,
              asset.uri,
              {
                httpMethod: "POST",
                uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": asset.mimeType ?? "image/jpeg",
                },
              },
            );
            const body = JSON.parse(upload.body || "{}") as { url?: string };
            if (upload.status >= 400 || !body.url) {
              showAppErrorToast(
                appError("UNKNOWN", {
                  title: "Upload failed",
                  message: `${filename} couldn't be uploaded. Please try again.`,
                }),
              );
              return null;
            }
            return { id: `${Date.now()}-${filename}`, url: body.url, previewUri: asset.uri };
          } catch (error) {
            showAppErrorToast(error);
            return null;
          }
        }),
      );
      const added = uploaded.filter((img): img is ReferenceImage => img !== null);
      if (added.length > 0) {
        setReferenceImages((current) => [...current, ...added].slice(0, maxImages));
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleLike = (creationId: Id<"canvasCreations">) => {
    toggleLike({ creationId }).catch(() => {
      toast.error("Couldn't update like", { description: "Please try again." });
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
          deleteCreation({ creationId: creation._id })
            .then(() => toast.success("Creation deleted"))
            .catch(showAppErrorToast);
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
        toast.success(isPublished ? "Published to Community" : "Made private");
      })
      .catch(showAppErrorToast);
  };

  const columnWidth = (windowWidth - 16 * 2 - 10) / 2;
  const promptOverLimit = !!maxChars && prompt.trim().length > maxChars;

  return (
    <View className="bg-background" style={{ flex: 1 }}>
      <KeyboardAvoidingView
        // The drawer's search field must not shove this screen around.
        enabled={!sidebarOpen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Absolute children live in this flex child so they ride the keyboard. */}
        <View style={{ flex: 1 }}>
        {/* Gallery */}
        {feed.results.length === 0 && feed.status !== "LoadingFirstPage" ? (
          <View
            className="flex-1 items-center justify-center px-8"
            style={{ paddingTop: headerHeight, paddingBottom: inputHeight }}
          >
            <View
              className="h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12"
              style={{
                ...softShadow({ color: primary, opacity: 0.35, radius: 16, offsetY: 6 }),
              }}
            >
              <Icon as={Sparkles} size={24} className="text-primary" />
            </View>
            <Text className="mt-5 text-[18px] font-semibold tracking-tight text-foreground">
              {tab === "community" ? "Nothing published yet" : "Your canvas is empty"}
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
              {tab === "community"
                ? "Be the first to publish. Community creations show up here."
                : "Describe an image or a scene below. Your creations land here."}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerClassName="px-4"
            contentContainerStyle={{
              paddingTop: headerHeight + 8,
              paddingBottom: inputHeight + 16,
            }}
            scrollIndicatorInsets={{ top: headerHeight, bottom: inputHeight }}
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
                <ActivityIndicator size="small" color={primary} />
              </View>
            ) : null}
          </ScrollView>
        )}

        {/* Canvas input bar — mirrors web CanvasInputBar (floating glass card) */}
        <View
          pointerEvents="box-none"
          onLayout={(event) => setInputHeight(event.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 14),
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[withAlpha(tokens.background, 0), withAlpha(tokens.background, 0.8), tokens.background]}
            locations={[0, 0.5, 1]}
            style={{ position: "absolute", left: 0, right: 0, top: -20, bottom: 0 }}
          />
          <View
            style={{
              borderRadius: 24,
              ...softShadow({ color: inputFocused ? primary : "#000000", opacity: inputFocused ? 0.45 : isDark ? 0.5 : 0.15, radius: 24, offsetY: 12 }),
            }}
          >
            {/* Web: `glow-rail rounded-3xl border border-border/40
                bg-background/45 shadow-2xl backdrop-blur-3xl` */}
            <GlassView
              intensity={60}
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: inputFocused ? withAlpha(primary, 0.32) : withAlpha(tokens.border, 0.4),
                backgroundColor: withAlpha(tokens.background, isDark ? 0.45 : 0.6),
              }}
            >
              {modeLocked ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/pricing" as Href)}
                  className="mx-3 mt-3 flex-row items-center gap-2 rounded-2xl border border-primary/20 bg-primary/8 px-3 py-2 active:opacity-85"
                >
                  <Icon as={Lock} size={13} className="text-primary" />
                  <Text className="flex-1 text-[12px] leading-4 text-foreground">
                    {mode === "image"
                      ? "This model needs Pro or Max. K-Image 1.0 is free."
                      : "Video needs Pro or Max."}
                  </Text>
                  <Text className="text-[12px] font-semibold text-primary">Upgrade</Text>
                </Pressable>
              ) : null}

              {/* Attached reference images */}
              {visibleReferences.length > 0 || isUploading ? (
                <View className="flex-row flex-wrap items-center gap-2.5 px-4 pt-3">
                  {visibleReferences.map((ref) => (
                    <View key={ref.id} className="relative">
                      <Image
                        source={{ uri: ref.previewUri }}
                        style={{ width: 48, height: 48, borderRadius: 12 }}
                        contentFit="cover"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove reference image"
                        hitSlop={8}
                        onPress={() =>
                          setReferenceImages((current) => current.filter((img) => img.id !== ref.id))
                        }
                        className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-foreground/80"
                      >
                        <Icon as={X} size={11} className="text-background" />
                      </Pressable>
                    </View>
                  ))}
                  {isUploading ? (
                    <View className="h-12 w-12 items-center justify-center rounded-xl border border-dashed border-foreground/15">
                      <ActivityIndicator size="small" color={primary} />
                    </View>
                  ) : null}
                  <Text className="flex-1 text-[11px] leading-4 text-muted-foreground">
                    {mode === "video" ? "Start frame" : "Reference"} · {visibleReferences.length}/{maxImages}
                  </Text>
                </View>
              ) : null}

              {/* Prompt row (web CanvasInputPrompt): 40px paperclip circle,
                  bold prompt, 40px glow-button generate */}
              <View className="flex-row items-end gap-2 px-3 pt-4">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach reference image"
                  onPress={() => void handlePickReferences()}
                  disabled={isUploading}
                  className="mb-1 h-10 w-10 items-center justify-center rounded-full border border-foreground/10 bg-foreground/4 active:bg-foreground/10"
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color={primary} />
                  ) : (
                    <Icon
                      as={Paperclip}
                      size={19}
                      color={visibleReferences.length ? primary : withAlpha(tokens.foreground, 0.45)}
                    />
                  )}
                </Pressable>
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="What do you want to create?"
                  placeholderTextColor={withAlpha(mutedForeground, 0.45)}
                  multiline
                  textAlignVertical="top"
                  style={{
                    flex: 1,
                    minHeight: 44,
                    maxHeight: 160,
                    paddingTop: 10,
                    paddingBottom: 8,
                    fontSize: 16,
                    lineHeight: 22,
                    fontWeight: "600",
                    color: tokens.foreground,
                  }}
                />
                <GlowButton
                  flat={!canSubmit}
                  disabled={!canSubmit}
                  accessibilityLabel={mode === "image" ? "Generate image" : "Generate video"}
                  onPress={() => void handleGenerate()}
                  style={{ width: 40, height: 40, marginBottom: 4 }}
                >
                  {isGenerating ? (
                    <ActivityIndicator size="small" color={primaryForeground} />
                  ) : (
                    <Icon
                      as={ArrowUp}
                      size={22}
                      strokeWidth={2.5}
                      color={canSubmit ? primaryForeground : withAlpha(tokens.foreground, 0.2)}
                    />
                  )}
                </GlowButton>
              </View>
              {promptOverLimit ? (
                <Text className="px-5 pb-1 text-[11px] text-destructive">
                  {selectedModel?.name} takes up to {maxChars} characters.
                </Text>
              ) : null}

              {/* Controls row (web CanvasInputControls, mobile layout):
                  glowing IMAGE/VIDEO toggle, settings circle, divider, model */}
              <View className="flex-row flex-wrap items-center gap-1.5 px-3 pb-4 pt-1">
                <View className="h-9 flex-row items-center gap-1 rounded-full border border-border/40 bg-secondary/15 p-1">
                  {(["image", "video"] as const).map((value) => {
                    const active = mode === value;
                    const ModeIcon = value === "image" ? ImageIcon : Clapperboard;
                    const label = value === "image" ? "Image" : "Video";
                    return active ? (
                      <GlowButton
                        key={value}
                        accessibilityLabel={`${label} generation`}
                        onPress={() => setMode(value)}
                        style={{ height: 28 }}
                      >
                        <View className="flex-row items-center gap-1.5 px-3">
                          <Icon as={ModeIcon} size={14} className="text-primary-foreground" />
                          <Text className="text-[12px] font-bold uppercase tracking-tight text-primary-foreground">
                            {label}
                          </Text>
                        </View>
                      </GlowButton>
                    ) : (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} generation`}
                        onPress={() => setMode(value)}
                        className="h-7 flex-row items-center gap-1.5 rounded-full px-3 active:bg-foreground/8"
                      >
                        <Icon as={ModeIcon} size={14} color={withAlpha(tokens.foreground, 0.55)} />
                        <Text
                          className="text-[12px] font-bold uppercase tracking-tight"
                          style={{ color: withAlpha(tokens.foreground, 0.55) }}
                        >
                          {label}
                        </Text>
                        {value === "video" && !canGenerateVideos ? (
                          <Icon as={Lock} size={10} color={withAlpha(tokens.foreground, 0.4)} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Generation settings"
                  onPress={() => setSettingsOpen(true)}
                  className="h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-secondary/20 active:bg-secondary/40"
                >
                  <Icon as={SlidersHorizontal} size={16} color={withAlpha(tokens.foreground, 0.7)} />
                </Pressable>

                <View className="mx-0.5 h-5 w-px bg-foreground/10" />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Model: ${selectedModel?.name ?? "Model"}`}
                  onPress={modelMenu.open}
                  className="h-9 flex-row items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/4 px-3.5 active:bg-foreground/8"
                >
                  <Text
                    numberOfLines={1}
                    className="max-w-40 text-[12px] font-bold uppercase tracking-tight"
                    style={{ color: withAlpha(tokens.foreground, 0.7) }}
                  >
                    {selectedModel?.name ?? "Model"}
                  </Text>
                </Pressable>

                {mode === "video" && !isFreeModel ? (
                  <View className="h-9 flex-row items-center gap-1 px-1">
                    <Icon as={Coins} size={12} className="text-muted-foreground" />
                    <Text className="text-[11px] font-medium text-muted-foreground">
                      {credits ? creditsAvailable : "…"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </GlassView>
            <GlowRail radius={24} focused={inputFocused} />
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>

      {/* Floating header: toolbar pills, segmented tabs and job status */}
      <View
        pointerEvents="box-none"
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[tokens.background, withAlpha(tokens.background, 0.8), withAlpha(tokens.background, 0)]}
          locations={[0, 0.6, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: -18 }}
        />
        {/* Web AppShell on /canvas (mobile): the icons pill plus a
            "Community ▾" select pill beside it */}
        <TopToolbar
          centerSlot={
            <GlassPill className="p-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gallery: ${tab === "community" ? "Community" : "My Creations"}`}
                onPress={tabMenu.open}
                className="h-8 flex-row items-center gap-1.5 rounded-xl px-3 active:bg-foreground/4"
              >
                <Text className="text-[12px] font-semibold text-foreground">
                  {tab === "community" ? "Community" : "My Creations"}
                </Text>
                <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
              </Pressable>
            </GlassPill>
          }
        />
        <View style={{ height: 10 }} />

        {/* Async video job banner */}
        {activeVideoJobId && activeJob && !jobDone ? (
          <View className="mx-4 mb-2 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-3">
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={primary} />
              <Text className="flex-1 text-[12.5px] font-medium text-foreground">
                Rendering video · {Math.round(activeJob.progress ?? 0)}%
                {activeJob.stage ? ` · ${activeJob.stage}` : ""}
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, Math.min(100, activeJob.progress ?? 0))}%` }}
              />
            </View>
          </View>
        ) : null}
        {activeJob?.status === "failed" ? (
          <View className="mx-4 mb-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-3">
            <Text className="text-[12.5px] text-destructive">
              Video render failed{activeJob.error ? `: ${activeJob.error}` : "."}
            </Text>
          </View>
        ) : null}

      </View>

      <CanvasSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        ratioOptions={ratioOptions.map((r) => r.value)}
        aspectRatio={aspectRatio}
        onAspectRatio={setPreferredRatio}
        durationOptions={durationOptions}
        duration={duration}
        onDuration={setPreferredDuration}
        resolutionOptions={resolutionOptions}
        resolution={resolution}
        onResolution={setPreferredResolution}
        showQuality={modelId.includes("kling")}
        quality={quality}
        onQuality={setQuality}
        costLine={
          mode === "video" && !isFreeModel
            ? credits
              ? `${creditsAvailable} credits available · this render costs ${videoCost}${bonusRemaining > 0 ? ` · includes ${bonusRemaining} bonus` : ""}`
              : "Loading credits…"
            : null
        }
        lockedLine={
          mode === "video" && isKVideo && durationOptions.length === 0
            ? "K-Video needs Pro (up to 60s) or Max (up to 3m)."
            : null
        }
      />

      {/* Community / My Creations select (web AppShell mobile Select) */}
      <Dropdown visible={tabMenu.visible} anchor={tabMenu.anchor} onClose={tabMenu.close} width={180}>
        {(["community", "mine"] as const).map((value) => (
          <DropdownItem
            key={value}
            label={value === "community" ? "Community" : "My Creations"}
            active={tab === value}
            onPress={() => {
              setTab(value);
              tabMenu.close();
            }}
            trailing={tab === value ? <Icon as={Check} size={14} className="text-primary" /> : undefined}
          />
        ))}
      </Dropdown>

      {/* Model dropdown — mirrors web PillSelect */}
      <Dropdown
        visible={modelMenu.visible}
        anchor={modelMenu.anchor}
        onClose={modelMenu.close}
        placement="above"
        width={248}
      >
        {models.map((model: CanvasModel) => {
          const active = model.id === modelId;
          const locked =
            !model.isFree && (mode === "image" ? !canGenerateImages : !canGenerateVideos);
          return (
            <DropdownItem
              key={model.id}
              label={model.name}
              active={active}
              onPress={() => {
                if (mode === "image") setImageModelId(model.id);
                else setVideoModelId(model.id);
                modelMenu.close();
              }}
              trailing={
                active ? (
                  <Icon as={Check} size={14} className="text-primary" />
                ) : model.isFree ? (
                  <Text className="text-[10px] font-semibold uppercase text-primary">Free</Text>
                ) : locked ? (
                  <View className="flex-row items-center gap-1">
                    <Icon as={Lock} size={10} className="text-muted-foreground" />
                    <Text className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Pro
                    </Text>
                  </View>
                ) : undefined
              }
            />
          );
        })}
      </Dropdown>


      <CreationLightbox
        creation={expanded}
        liked={expanded ? likedIds.has(expanded._id) : false}
        isOwn={tab === "mine"}
        onClose={() => setExpanded(null)}
        onLike={() => expanded && handleToggleLike(expanded._id)}
        onTogglePublish={() => expanded && handleTogglePublish(expanded)}
        onDelete={() => expanded && handleDelete(expanded)}
      />
    </View>
  );
}

/* ─── Settings sheet ───────────────────────────────────────────────────── */

function CanvasSettingsSheet({
  visible,
  onClose,
  mode,
  ratioOptions,
  aspectRatio,
  onAspectRatio,
  durationOptions,
  duration,
  onDuration,
  resolutionOptions,
  resolution,
  onResolution,
  showQuality,
  quality,
  onQuality,
  costLine,
  lockedLine,
}: {
  visible: boolean;
  onClose: () => void;
  mode: Mode;
  ratioOptions: string[];
  aspectRatio: string;
  onAspectRatio: (value: string) => void;
  durationOptions: number[];
  duration: number;
  onDuration: (value: number) => void;
  resolutionOptions: { value: string; label: string }[];
  resolution: string;
  onResolution: (value: string) => void;
  showQuality: boolean;
  quality: "standard" | "pro";
  onQuality: (value: "standard" | "pro") => void;
  costLine: string | null;
  lockedLine: string | null;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-[28px] border border-b-0 border-foreground/10 bg-popover px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-foreground/15" />
          </View>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-[17px] font-semibold tracking-tight text-foreground">
              {mode === "image" ? "Image settings" : "Video settings"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              onPress={onClose}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5"
            >
              <Icon as={X} size={16} className="text-muted-foreground" />
            </Pressable>
          </View>

          <SettingGroup label="Aspect ratio">
            {ratioOptions.map((ratio) => (
              <ChoiceChip
                key={ratio}
                label={ratio}
                selected={aspectRatio === ratio}
                onPress={() => onAspectRatio(ratio)}
                preview={ratio}
              />
            ))}
          </SettingGroup>

          {mode === "video" ? (
            <>
              <SettingGroup label="Duration">
                {durationOptions.map((d) => (
                  <ChoiceChip
                    key={d}
                    label={formatDuration(d)}
                    selected={duration === d}
                    onPress={() => onDuration(d)}
                  />
                ))}
              </SettingGroup>
              {resolutionOptions.length > 0 ? (
                <SettingGroup label="Resolution">
                  {resolutionOptions.map((r) => (
                    <ChoiceChip
                      key={r.value}
                      label={r.label}
                      selected={resolution === r.value}
                      onPress={() => onResolution(r.value)}
                    />
                  ))}
                </SettingGroup>
              ) : null}
              {showQuality ? (
                <SettingGroup label="Quality">
                  {(["standard", "pro"] as const).map((q) => (
                    <ChoiceChip
                      key={q}
                      label={q === "pro" ? "Pro" : "Standard"}
                      selected={quality === q}
                      onPress={() => onQuality(q)}
                    />
                  ))}
                </SettingGroup>
              ) : null}
            </>
          ) : null}

          {lockedLine ? (
            <Text className="mt-1 text-[12px] leading-4 text-primary">{lockedLine}</Text>
          ) : null}
          {costLine ? (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Icon as={Coins} size={12} className="text-muted-foreground" />
              <Text className="flex-1 text-[12px] leading-4 text-muted-foreground">{costLine}</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">{children}</View>
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  preview,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Aspect ratio to sketch as a tiny frame beside the label. */
  preview?: string;
}) {
  const ratio = preview ? aspectToNumber(preview) : null;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "min-h-9 flex-row items-center gap-2 rounded-full border px-3.5",
        selected
          ? "border-primary/40 bg-primary/15"
          : "border-foreground/8 bg-foreground/5 active:bg-foreground/10",
      )}
    >
      {ratio ? (
        <View
          className={cn("rounded-[3px] border", selected ? "border-primary" : "border-muted-foreground/60")}
          style={
            ratio >= 1
              ? { width: 14, height: Math.max(5, 14 / ratio) }
              : { height: 14, width: Math.max(5, 14 * ratio) }
          }
        />
      ) : null}
      <Text
        className={cn(
          "text-[13px] font-medium",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ─── Gallery ──────────────────────────────────────────────────────────── */

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
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={creation.prompt}
      onPress={onPress}
      className="overflow-hidden rounded-2xl border border-foreground/8 bg-card active:opacity-90"
    >
      {creation.mediaType === "video" ? (
        <View
          className="items-center justify-center bg-black/40"
          style={{ width: "100%", height: Math.min(height, width * 1.4) }}
        >
          <View className="h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/15">
            <Icon as={Play} size={20} color="#ffffff" />
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
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike" : "Like"}
          hitSlop={8}
          onPress={onLike}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Icon
            as={Heart}
            size={13}
            color={liked ? primary : undefined}
            fill={liked ? primary : "transparent"}
            className={liked ? undefined : "text-muted-foreground"}
          />
          <Text className="text-[11.5px] text-muted-foreground">{creation.likeCount}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Web CreationLightbox: media, creator, prompt, metadata pills, actions. */
function CreationLightbox({
  creation,
  liked,
  isOwn,
  onClose,
  onLike,
  onTogglePublish,
  onDelete,
}: {
  creation: Creation | null;
  liked: boolean;
  isOwn: boolean;
  onClose: () => void;
  onLike: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}) {
  const { primary } = useTheme();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const model = creation ? getCanvasModelById(creation.modelId) : undefined;

  const handleDownload = async () => {
    if (!creation || saving) return;
    setSaving(true);
    try {
      await shareMediaFile(creation.mediaUrl, {
        filename: `canvas_${creation._id}`,
        fallbackExt: creation.mediaType === "video" ? "mp4" : "png",
      });
    } catch (error) {
      showAppErrorToast(error);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!creation) return;
    const url = `${API_BASE_URL}/canvas?id=${creation._id}`;
    try {
      await NativeShare.share(
        Platform.OS === "ios"
          ? { url, message: creation.prompt }
          : { message: `${creation.prompt}\n${url}` },
      );
    } catch {
      // Share sheet dismissed.
    }
  };

  const pills = creation
    ? [
        model?.name ?? creation.modelId,
        creation.aspectRatio,
        creation.resolution,
        creation.duration ? formatDuration(creation.duration) : undefined,
      ].filter((value): value is string => !!value)
    : [];

  return (
    <Modal
      visible={creation !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/90">
        <Pressable className="absolute inset-0" accessibilityLabel="Close preview" onPress={onClose} />
        <View className="flex-1 justify-center px-4" pointerEvents="box-none" style={{ paddingTop: insets.top + 52 }}>
          {creation ? (
            creation.mediaType === "video" ? (
              <VideoLightbox creation={creation} />
            ) : (
              <Image
                source={{ uri: creation.mediaUrl }}
                style={{
                  width: "100%",
                  aspectRatio: aspectToNumber(creation.aspectRatio),
                  maxHeight: "62%",
                  borderRadius: 16,
                }}
                contentFit="contain"
                transition={150}
              />
            )
          ) : null}
        </View>

        <View
          className="absolute left-0 right-0 flex-row items-center justify-end px-4"
          style={{ top: insets.top + 8 }}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 active:bg-white/20"
          >
            <Icon as={X} size={18} color="#ffffff" />
          </Pressable>
        </View>

        {creation ? (
          <View className="px-4" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="rounded-3xl border border-foreground/10 bg-popover p-4">
              <View className="flex-row items-center gap-2.5">
                {creation.ownerImageUrl ? (
                  <Image
                    source={{ uri: creation.ownerImageUrl }}
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                  />
                ) : (
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                    <Text className="text-[12px] font-semibold text-primary">
                      {(creation.ownerName ?? "A").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-[13px] font-semibold text-foreground">
                    {creation.ownerName ?? "Anonymous"}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {new Date(creation.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>
              </View>

              <ScrollView style={{ maxHeight: 96 }} className="mt-3">
                <Text selectable className="text-[13.5px] leading-5 text-foreground/90">
                  {creation.prompt}
                </Text>
              </ScrollView>

              <View className="mt-3 flex-row flex-wrap gap-1.5">
                {pills.map((pill) => (
                  <View
                    key={pill}
                    className="rounded-full border border-foreground/8 bg-foreground/5 px-2.5 py-1"
                  >
                    <Text className="text-[11px] font-medium text-muted-foreground">{pill}</Text>
                  </View>
                ))}
              </View>

              <View className="mt-4 flex-row flex-wrap items-center gap-2">
                <LightboxAction
                  label={String(creation.likeCount)}
                  accessibilityLabel={liked ? "Unlike" : "Like"}
                  onPress={onLike}
                  icon={
                    <Icon
                      as={Heart}
                      size={14}
                      color={liked ? primary : undefined}
                      fill={liked ? primary : "transparent"}
                      className={liked ? undefined : "text-muted-foreground"}
                    />
                  }
                />
                <LightboxAction
                  label={saving ? "Saving…" : "Save"}
                  onPress={() => void handleDownload()}
                  icon={<Icon as={Download} size={14} className="text-muted-foreground" />}
                />
                {creation.isPublished ? (
                  <LightboxAction
                    label="Share"
                    onPress={() => void handleShare()}
                    icon={<Icon as={Share2} size={14} className="text-muted-foreground" />}
                  />
                ) : null}
                {isOwn ? (
                  <>
                    <LightboxAction
                      label={creation.isPublished ? "Unpublish" : "Publish"}
                      onPress={onTogglePublish}
                      icon={
                        <Icon
                          as={creation.isPublished ? GlobeLock : Globe}
                          size={14}
                          className="text-muted-foreground"
                        />
                      }
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete creation"
                      onPress={onDelete}
                      className="h-9 w-9 items-center justify-center rounded-full bg-destructive/12 active:opacity-80"
                    >
                      <Icon as={Trash2} size={14} className="text-destructive" />
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function LightboxAction({
  label,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="h-9 flex-row items-center gap-1.5 rounded-full border border-foreground/8 bg-foreground/5 px-3 active:bg-foreground/10"
    >
      {icon}
      <Text className="text-[12.5px] font-medium text-foreground">{label}</Text>
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
