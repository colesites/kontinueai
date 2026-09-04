import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Brain,
  Braces,
  Check,
  ChevronDown,
  Gem,
  ImagePlus,
  LayoutGrid,
  Save,
  SaveAll,
  Search,
  SlidersHorizontal,
  Type,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { AVAILABLE_MODELS, type ModelOption } from "@repo/ai/lib/models";
import type { ModelCapability } from "@repo/core/model-capabilities";
import { canAccessModel } from "@repo/core/plan-access";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";

// This is intentionally the web asset, not the old mobile launcher icon.
// Metro's workspace resolver bundles it with the native app.
const KONTINUE_MODEL_ICON = require("../../../../web/public/kontinueai-icon.png");

const PROVIDER_LABELS: Record<string, string> = {
  kontinue: "Kontinue",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
  deepseek: "DeepSeek",
  perplexity: "Perplexity",
  minimax: "MiniMax",
  zai: "Z.ai",
  alibaba: "Alibaba",
  moonshotai: "Moonshot AI",
  mistral: "Mistral",
};

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

export function ProviderLogo({
  provider,
  size = 12,
}: {
  provider: string;
  size?: number;
}) {
  const { isDark } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);

  if (logoFailed) {
    return (
      <View
        className="items-center justify-center rounded-md border border-foreground/8 bg-foreground/5"
        style={{ width: size, height: size }}
      >
        <Text className="text-[8px] font-bold text-foreground">
          {provider.slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={
        provider === "kontinue"
          ? KONTINUE_MODEL_ICON
          : { uri: `https://models.dev/logos/${provider}.svg` }
      }
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={
        provider === "kontinue"
          ? isDark
            ? "#ffffff"
            : "#111111"
          : isDark
            ? "#ffffff"
            : undefined
      }
      onError={() => setLogoFailed(true)}
    />
  );
}

const CAPABILITY_ICONS: Record<ModelCapability, LucideIcon> = {
  text: Type,
  "image-generation": ImagePlus,
  "implicit-caching": Save,
  "explicit-caching": SaveAll,
  "web-search": Search,
  thinking: Brain,
  embedding: Braces,
};

export function ModelCapabilityIcons({
  capabilities,
  size = 13,
}: {
  capabilities: ModelCapability[];
  size?: number;
}) {
  const visible = capabilities.filter((capability) => CAPABILITY_ICONS[capability]);
  if (!visible.length) return null;

  return (
    <View className="flex-row items-center gap-1">
      {visible.map((capability) => (
        <Icon
          key={capability}
          as={CAPABILITY_ICONS[capability]}
          size={size}
          className="text-muted-foreground/80"
        />
      ))}
    </View>
  );
}

export function PremiumModelBadge({ size = 16 }: { size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-full border border-primary/25 bg-primary/15"
      style={{ width: size, height: size }}
    >
      <Icon as={Gem} size={size * 0.6} className="text-primary" />
    </View>
  );
}

export function ModelSelectorTrigger({
  modelId,
  onPress,
}: {
  modelId: string;
  onPress: () => void;
}) {
  const { isProModel } = useModelCapabilities();
  const model = AVAILABLE_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Choose model. Current model ${model.name}`}
      /* h-9 matches the sibling "+" button exactly; the old min-h-11 made the
         trigger taller than it and broke the row's optical alignment. */
      className="h-9 max-w-[210px] flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/3 px-3 active:bg-foreground/8"
    >
      <View
        className="h-5 w-5 shrink-0 items-center justify-center border border-foreground/5 bg-foreground/5 overflow-hidden"
        style={{ borderRadius: 6 }}
      >
        <ProviderLogo provider={model.provider} size={12} />
      </View>
      <Text numberOfLines={1} className="min-w-0 shrink text-[13px] font-medium text-foreground">
        {model.name}
      </Text>
      {isProModel(model.id) ? <PremiumModelBadge size={14} /> : null}
      <Icon as={ChevronDown} size={14} className="shrink-0 text-muted-foreground/50" />
    </Pressable>
  );
}

/** Native translation of web SharedModelSelectorContent. */
export function ModelSelector({
  visible,
  onClose,
  selectedModel,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selectedModel: string;
  onSelect: (modelId: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { primary, mutedForeground } = useTheme();
  const planTier = usePlanTier();
  const { getCapabilities, getModelAccessClass } = useModelCapabilities();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const models = useMemo(
    () => AVAILABLE_MODELS.filter((model) => model.modality !== "realtime"),
    [],
  );
  const grouped = useMemo(() => {
    const result = new Map<string, ModelOption[]>();
    for (const model of models) {
      const group = result.get(model.provider) ?? [];
      group.push(model);
      result.set(model.provider, group);
    }
    return result;
  }, [models]);
  const providers = [...grouped.keys()];
  const visibleProviders = activeProvider ? [activeProvider] : providers;
  const term = search.trim().toLowerCase();
  const matches = (model: ModelOption) =>
    !term ||
    `${model.name} ${providerLabel(model.provider)} ${model.description}`
      .toLowerCase()
      .includes(term);
  const hasResults = visibleProviders.some((provider) =>
    (grouped.get(provider) ?? []).some(matches),
  );

  const close = () => {
    setSearch("");
    setActiveProvider(null);
    onClose();
  };

  const panelWidth = Math.min(width - 24, 720);
  const availableHeight = height - insets.top - insets.bottom - 24;
  const panelHeight = Math.max(480, Math.min(680, availableHeight));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 bg-black/70">
        <Pressable className="absolute inset-0" accessibilityLabel="Close model selector" onPress={close} />
        <View
          className="flex-1 items-center justify-center px-3"
          style={{ pointerEvents: "box-none" }}
        >
          <View
            testID="model-selector-dialog"
            className="overflow-hidden rounded-2xl border border-foreground/10 bg-background"
            style={{
              width: panelWidth,
              height: Math.min(panelHeight, availableHeight),
              boxShadow: "0 14px 28px rgba(0,0,0,0.34)",
            }}
          >
            <View className="min-h-[88px] flex-row items-start gap-3 border-b border-foreground/8 px-5 pb-4 pt-5 pr-4">
              <View className="mt-0.5 h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-foreground/6 bg-foreground/5">
                <Icon as={SlidersHorizontal} size={16} className="text-primary" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[17px] font-semibold tracking-tight text-foreground">Choose a model</Text>
                <Text className="mt-0.5 text-[12px] leading-4.5 text-muted-foreground">
                  Find the right balance of intelligence, speed, and capability.
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close model selector"
                className="h-11 w-11 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>

            <View className="h-14 flex-row items-center gap-3 border-b border-foreground/8 px-5">
              <Icon as={Search} size={16} className="text-muted-foreground/70" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={`Search ${models.length} models…`}
                placeholderTextColor={mutedForeground}
                className="h-full min-w-0 flex-1 text-[15px] text-foreground"
                accessibilityLabel="Search AI models"
              />
              {search ? (
                <Pressable
                  accessibilityLabel="Clear model search"
                  onPress={() => setSearch("")}
                  className="h-11 w-11 items-center justify-center rounded-full active:bg-foreground/8"
                >
                  <Icon as={X} size={13} strokeWidth={2.5} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>

            <View className="border-b border-foreground/8 py-2.5">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-1.5 px-4"
              >
                <ProviderChip
                  label="All"
                  count={models.length}
                  selected={activeProvider === null}
                  onPress={() => setActiveProvider(null)}
                  icon={<Icon as={LayoutGrid} size={14} className={activeProvider === null ? "text-background" : "text-muted-foreground"} />}
                />
                {providers.map((provider) => (
                  <ProviderChip
                    key={provider}
                    label={providerLabel(provider)}
                    count={grouped.get(provider)?.length ?? 0}
                    selected={activeProvider === provider}
                    onPress={() => setActiveProvider(provider)}
                    icon={<ProviderLogo provider={provider} size={14} />}
                  />
                ))}
              </ScrollView>
            </View>

            {!hasResults ? (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-[14px] text-muted-foreground">
                  No matching models. Try a provider or capability name.
                </Text>
              </View>
            ) : (
              <ScrollView
                className="flex-1"
                contentContainerClassName="px-3 pb-5 pt-2"
                showsVerticalScrollIndicator={false}
              >
                {visibleProviders.map((provider) => {
                  const providerModels = (grouped.get(provider) ?? []).filter(matches);
                  if (!providerModels.length) return null;
                  return (
                    <View key={provider} className="pb-2">
                      <View className="flex-row items-center gap-2 px-2 pb-2 pt-3">
                        <ProviderLogo provider={provider} size={14} />
                        <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {providerLabel(provider)} · {providerModels.length}
                        </Text>
                      </View>
                      <View className="gap-1.5">
                        {providerModels.map((model) => {
                          const modelClass = getModelAccessClass(model.id);
                          const isKai = model.provider === "kontinue";
                          const disabled = !isKai && !canAccessModel(planTier, model.id, modelClass);
                          const selected = model.id === selectedModel;
                          return (
                            <Pressable
                              key={model.id}
                              disabled={disabled}
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${model.name}`}
                              accessibilityState={{ selected, disabled }}
                              onPress={() => {
                                onSelect(model.id);
                                close();
                              }}
                              className={cn(
                                "min-h-[76px] flex-row items-center gap-3 rounded-xl border px-3 py-2.5",
                                selected
                                  ? "border-primary/35 bg-primary/8"
                                  : "border-transparent bg-foreground/3 active:border-foreground/10 active:bg-foreground/6",
                                disabled && "opacity-50",
                              )}
                              style={selected ? { borderLeftWidth: 3, borderLeftColor: primary } : undefined}
                            >
                              <View
                                className={cn("h-10 w-10 shrink-0 items-center justify-center border border-foreground/6 bg-foreground/5 overflow-hidden", selected && "border-primary/25 bg-primary/12")}
                                style={{ borderRadius: 10 }}
                               >
                                 <ProviderLogo provider={model.provider} size={18} />
                               </View>
                              <View className="min-w-0 flex-1 py-0.5">
                                <View className="flex-row items-center gap-2">
                                  <Text numberOfLines={1} className="min-w-0 shrink text-[13.5px] font-semibold text-foreground">
                                    {model.name}
                                  </Text>
                                  {!isKai ? (
                                    <View className="shrink-0 flex-row items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-1.5 py-0.5">
                                      <PremiumModelBadge size={12} />
                                      <Text className="text-[9.5px] font-semibold capitalize text-primary">{modelClass}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                <Text numberOfLines={1} className="mt-1 text-[12px] text-muted-foreground">
                                  {model.description || "A capable general-purpose AI model."}
                                </Text>
                                <View className="mt-1.5">
                                  <ModelCapabilityIcons capabilities={getCapabilities(model.id)} size={11} />
                                </View>
                              </View>
                              <View className={cn("h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary" : "border-foreground/15")}>
                                {selected ? <Icon as={Check} size={12} strokeWidth={3} className="text-primary-foreground" /> : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ProviderChip({
  label,
  count,
  selected,
  onPress,
  icon,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === "All" ? "All models" : `${label} models`}
      accessibilityState={{ selected }}
      className={cn(
        "min-h-11 shrink-0 flex-row items-center gap-1.5 rounded-full px-3",
        selected ? "bg-foreground" : "border border-foreground/6 bg-foreground/4 active:bg-foreground/8",
      )}
    >
      {icon}
      <Text className={cn("text-[12px] font-medium", selected ? "text-background" : "text-muted-foreground")}>{label}</Text>
      <Text className={cn("text-[11px]", selected ? "text-background/60" : "text-muted-foreground/60")}>{count}</Text>
    </Pressable>
  );
}

export function getModelLabel(modelId: string): string {
  return AVAILABLE_MODELS.find((model) => model.id === modelId)?.name ?? modelId;
}
