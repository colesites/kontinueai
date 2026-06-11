import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Image } from "expo-image";
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
  Type,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { AVAILABLE_MODELS, type ModelOption } from "@repo/ai/lib/models";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import type { ModelCapability } from "@repo/core/model-capabilities";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useIsProPlan } from "@/hooks/use-plan-tier";
import { cn } from "@/lib/utils";

// Mirrors web ModelSelectorLogo: models.dev hosts every provider mark;
// Kontinue uses the local brand icon. Logos are monochrome-inverted in dark
// mode on web (dark:invert) — tintColor reproduces that.
const KONTINUE_ICON = require("@/assets/images/kontinue-icon.png");

const PROVIDER_LABELS: Record<string, string> = {
  kontinue: "K",
  openai: "AI",
  anthropic: "A",
  google: "G",
  xai: "x1",
  deepseek: "DS",
  perplexity: "P",
  minimax: "M",
  zai: "Z",
  alibaba: "A",
  moonshotai: "M",
  mistral: "M",
};

export function ProviderLogo({
  provider,
  size = 12,
}: {
  provider: string;
  size?: number;
}) {
  const { isDark } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);
  const fallbackLabel =
    PROVIDER_LABELS[provider] ?? provider.slice(0, 2).toUpperCase();

  if (logoFailed) {
    return (
      <View
        className="items-center justify-center rounded-md border border-foreground/8 bg-foreground/5"
        style={{ width: size, height: size }}
      >
        <Text className="text-[9px] font-bold text-foreground">
          {fallbackLabel}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={
        provider === "kontinue"
          ? KONTINUE_ICON
          : { uri: `https://models.dev/logos/${provider}.svg` }
      }
      style={{ width: size, height: size }}
      contentFit="contain"
      tintColor={isDark || provider === "kontinue" ? "#ffffff" : "#111111"}
      onError={() => setLogoFailed(true)}
    />
  );
}

// Mirrors web ModelCapabilityIcons (react-icons swapped for lucide marks).
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
  if (!capabilities.length) return null;
  const visibleCapabilities = capabilities.filter(
    (cap) => CAPABILITY_ICONS[cap],
  );
  if (!visibleCapabilities.length) return null;

  return (
    <View className="flex-row items-center gap-1">
      {visibleCapabilities.map((cap) => (
        <Icon
          key={cap}
          as={CAPABILITY_ICONS[cap]}
          size={size}
          className="text-muted-foreground/80"
        />
      ))}
    </View>
  );
}

/** Mirrors web PremiumModelBadge — the small diamond-in-a-ring chip. */
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

/** Composer trigger — logo chip · name · premium badge · capabilities · chevron. */
export function ModelSelectorTrigger({
  modelId,
  onPress,
}: {
  modelId: string;
  onPress: () => void;
}) {
  const { getCapabilities, isProModel } = useModelCapabilities();
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-8 flex-row items-center gap-1.5 rounded-full px-2 active:bg-foreground/5"
    >
      <View
        className="h-7 w-7 items-center justify-center border border-foreground/8 bg-foreground/8"
        style={{ borderRadius: 10 }}
      >
        <ProviderLogo provider={model.provider} size={18} />
      </View>
      <Text
        numberOfLines={1}
        className="max-w-32 text-[13px] font-medium text-foreground"
      >
        {model.name}
      </Text>
      {isProModel(model.id) ? <PremiumModelBadge /> : null}
      <ModelCapabilityIcons
        capabilities={getCapabilities(model.id).slice(0, 3)}
        size={12}
      />
      <Icon as={ChevronDown} size={13} className="text-muted-foreground/50" />
    </Pressable>
  );
}

/**
 * Full model selector — mirrors SharedModelSelectorContent: provider rail on
 * the left (icon column, like web's mobile breakpoint), searchable model
 * cards on the right.
 */
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
  const isPaidPlan = useIsProPlan();
  const { getCapabilities, isProModel, proModelById } = useModelCapabilities();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const acc = new Map<string, ModelOption[]>();
    for (const m of AVAILABLE_MODELS) {
      const list = acc.get(m.provider) ?? [];
      list.push(m);
      acc.set(m.provider, list);
    }
    return acc;
  }, []);
  const providers = [...grouped.keys()];

  const term = search.trim().toLowerCase();
  const visibleProviders = activeProvider ? [activeProvider] : providers;
  const filterModel = (m: ModelOption) =>
    !term ||
    m.name.toLowerCase().includes(term) ||
    m.description.toLowerCase().includes(term) ||
    m.provider.toLowerCase().includes(term);
  const hasVisibleModels = visibleProviders.some((provider) =>
    (grouped.get(provider) ?? []).some(filterModel),
  );

  const close = () => {
    setSearch("");
    setActiveProvider(null);
    onClose();
  };
  const panelWidth = Math.min(width - 40, 520);
  const panelHeight = Math.max(440, height - insets.top - insets.bottom - 64);
  const railBodyHeight = panelHeight - 56;
  const railItemCount = providers.length + 1;
  const railSlotHeight = railBodyHeight / railItemCount;
  const railActiveSize = Math.min(50, Math.max(36, railSlotHeight - 2));
  const railProviderHeight = Math.min(42, Math.max(30, railSlotHeight - 4));
  const railLogoBox = Math.min(34, Math.max(24, railProviderHeight - 10));
  const railLogoSize = Math.min(18, Math.max(14, railLogoBox - 10));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View className="flex-1 bg-black/70">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close model selector"
          className="absolute inset-0"
          onPress={close}
        />

        <SafeAreaView
          className="flex-1 items-center justify-center px-5"
          edges={["top", "right", "bottom", "left"]}
          pointerEvents="box-none"
        >
          <View
            testID="model-selector-dialog"
            className="overflow-hidden rounded-2xl border border-foreground/10 bg-background"
            style={{
              width: panelWidth,
              height: panelHeight,
              shadowColor: "#000000",
              shadowOpacity: 0.35,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 14 },
              elevation: 20,
            }}
          >
            <View className="flex-1 flex-row overflow-hidden">
              {/* Provider rail — icon column, matching web's narrow breakpoint. */}
              <View className="w-[78px] shrink-0 border-r border-foreground/8 bg-black/10">
                <View className="h-14 items-center justify-center border-b border-foreground/8 px-2">
                  <Icon
                    as={LayoutGrid}
                    size={16}
                    className="text-muted-foreground"
                  />
                </View>
                <View className="flex-1 items-center justify-between px-2 py-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="All models"
                    onPress={() => setActiveProvider(null)}
                    className={cn(
                      "items-center justify-center",
                      activeProvider === null
                        ? "bg-foreground/10"
                        : "active:bg-foreground/4",
                    )}
                    style={{
                      width: 50,
                      height: railActiveSize,
                      borderRadius: 14,
                    }}
                  >
                    <View
                      className="items-center justify-center border border-foreground/8 bg-foreground/8"
                      style={{
                        width: railLogoBox,
                        height: railLogoBox,
                        borderRadius: 10,
                      }}
                    >
                      <Icon
                        as={LayoutGrid}
                        size={railLogoSize}
                        className="text-muted-foreground"
                      />
                    </View>
                  </Pressable>
                  {providers.map((provider) => (
                    <Pressable
                      key={provider}
                      accessibilityRole="button"
                      accessibilityLabel={`${provider} models`}
                      onPress={() => setActiveProvider(provider)}
                      className={cn(
                        "items-center justify-center",
                        activeProvider === provider
                          ? "bg-foreground/10"
                          : "active:bg-foreground/4",
                      )}
                      style={{
                        width: 50,
                        height: railProviderHeight,
                        borderRadius: 14,
                      }}
                    >
                      <View
                        className="items-center justify-center border border-foreground/8 bg-foreground/8"
                        style={{
                          width: railLogoBox,
                          height: railLogoBox,
                          borderRadius: 9,
                        }}
                      >
                        <ProviderLogo provider={provider} size={railLogoSize} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Models pane */}
              <View className="min-w-0 flex-1">
                <View className="h-14 flex-row items-center gap-3 border-b border-foreground/8 bg-black/5 pl-5 pr-3">
                  <Icon
                    as={Search}
                    size={16}
                    className="text-muted-foreground/70"
                  />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search models..."
                    placeholderTextColor="#7c6c77"
                    className="h-full flex-1 text-[15px] text-foreground"
                    accessibilityLabel="Search models"
                  />
                  {search.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      onPress={() => setSearch("")}
                      className="h-6 w-6 items-center justify-center rounded-full active:bg-foreground/8"
                    >
                      <Icon
                        as={X}
                        size={12}
                        strokeWidth={2.5}
                        className="text-muted-foreground/70"
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={close}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Close model selector"
                    className="h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
                  >
                    <Icon as={X} size={16} className="text-muted-foreground" />
                  </Pressable>
                </View>

                {!hasVisibleModels ? (
                  <View className="flex-1 items-center justify-center px-5">
                    <Text className="text-center text-[14px] text-muted-foreground">
                      No models found.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    contentContainerClassName="px-4 pb-8"
                    showsVerticalScrollIndicator={false}
                  >
                    {visibleProviders.map((provider) => {
                      const models = (grouped.get(provider) ?? []).filter(
                        filterModel,
                      );
                      if (models.length === 0) return null;
                      return (
                        <View key={provider}>
                          {!activeProvider ? (
                            <View className="flex-row items-center gap-2.5 px-2 pb-3 pt-6">
                              <ProviderLogo provider={provider} size={16} />
                              <Text className="text-[12px] font-semibold uppercase tracking-[4px] text-muted-foreground/75">
                                {provider}
                              </Text>
                            </View>
                          ) : (
                            <View className="pt-4" />
                          )}
                          <View className="gap-3 pb-1">
                            {models.map((m) => {
                              const proModel = isProModel(m.id);
                              const disabledByPlan =
                                !isPaidPlan &&
                                proModel &&
                                proModelById[m.id] === true;
                              const isSelected = selectedModel === m.id;
                              return (
                                <Pressable
                                  key={m.id}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Select ${m.name}`}
                                  accessibilityState={{
                                    selected: isSelected,
                                    disabled: disabledByPlan,
                                  }}
                                  disabled={disabledByPlan}
                                  onPress={() => {
                                    onSelect(m.id);
                                    close();
                                  }}
                                  className={cn(
                                    "relative min-h-36 rounded-2xl border bg-background/60 px-5 py-5",
                                    isSelected
                                      ? "border-primary/40 bg-primary/5"
                                      : "border-foreground/10 active:bg-foreground/4",
                                    disabledByPlan && "opacity-45",
                                  )}
                                  style={
                                    isSelected
                                      ? {
                                          shadowColor: "#ec4899",
                                          shadowOpacity: 0.55,
                                          shadowRadius: 24,
                                          shadowOffset: { width: 0, height: 0 },
                                        }
                                      : undefined
                                  }
                                >
                                  {/* Top row: logo + capabilities + check */}
                                  <View className="flex-row items-start justify-between">
                                    <View
                                      className={cn(
                                        "h-10 w-10 items-center justify-center rounded-xl border",
                                        isSelected
                                          ? "border-primary/30 bg-primary/25"
                                          : "border-foreground/10 bg-foreground/5",
                                      )}
                                    >
                                      <ProviderLogo
                                        provider={m.provider}
                                        size={20}
                                      />
                                    </View>
                                    <View className="flex-row items-center gap-2">
                                      <ModelCapabilityIcons
                                        capabilities={getCapabilities(m.id)}
                                      />
                                      <View
                                        className={cn(
                                          "h-5 w-5 items-center justify-center rounded-full",
                                          isSelected
                                            ? "bg-primary"
                                            : "opacity-0",
                                        )}
                                        style={{
                                          transform: [
                                            { scale: isSelected ? 1 : 0.75 },
                                          ],
                                        }}
                                      >
                                        <Icon
                                          as={Check}
                                          size={12}
                                          strokeWidth={3}
                                          className="text-primary-foreground"
                                        />
                                      </View>
                                    </View>
                                  </View>

                                  {/* Bottom row: name + description */}
                                  <View className="mt-7 gap-1.5">
                                    <View className="flex-row items-center gap-1.5">
                                      <Text
                                        numberOfLines={1}
                                        className={cn(
                                          "min-w-0 shrink text-[19px]",
                                          isSelected
                                            ? "font-semibold text-foreground"
                                            : "font-medium text-foreground",
                                        )}
                                      >
                                        {m.name}
                                      </Text>
                                      {proModel ? <PremiumModelBadge /> : null}
                                    </View>
                                    <Text
                                      numberOfLines={2}
                                      className="text-[16px] leading-6 text-muted-foreground/75"
                                    >
                                      {m.description || "A powerful AI model."}
                                    </Text>
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
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Short label for places that only need the model's name. */
export function getModelLabel(modelId: string): string {
  return AVAILABLE_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
}
