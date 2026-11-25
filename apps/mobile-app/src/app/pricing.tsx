import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import {
  getPlanCardHighlights,
  PLAN_CARD_PRESENTATION,
  PLAN_DEFINITIONS,
} from "@repo/core/plan-config";
import { PLAN_TIERS, type PlanTier } from "@repo/core/plan-tier";
import {
  PRICING_COMPARISON_SECTIONS,
  type PricingComparisonValue,
} from "@repo/core/pricing-comparison";
import { Check, ExternalLink, Sparkles } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { API_BASE_URL } from "@/lib/chat-api";
import { cn } from "@/lib/utils";
import { softShadow } from "@/lib/shadow";

type Audience = "personal" | "professional";

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "professional", label: "Professional" },
];

const CREDIT_EXPLAINERS: [string, string][] = [
  [
    "Chat, search, and media",
    "Paid model work, provider-backed web search, K-Image, and K-Video draw from the same monthly balance.",
  ],
  [
    "Canvas",
    "Opening Canvas costs nothing. AI generation inside it consumes credits.",
  ],
  [
    "Live and safeguards",
    "Live voice uses credits while connected. Product-specific ceilings still protect you from unexpected overuse.",
  ],
];

// Same rate table as web /pricing.
const RATES: [string, string][] = [
  ["Basic request", `${AI_USAGE_CREDIT_COSTS.chatRequest.basic} credit`],
  ["Pro request", `${AI_USAGE_CREDIT_COSTS.chatRequest.pro} credits`],
  ["Frontier request", `${AI_USAGE_CREDIT_COSTS.chatRequest.frontier} credits`],
  ["Web search", `${AI_USAGE_CREDIT_COSTS.webSearch} credits`],
  ["K-Image", `${AI_USAGE_CREDIT_COSTS.imageGeneration} credits`],
  ["K-Video", `from ${AI_USAGE_CREDIT_COSTS.videoGenerationPerSecond}/second`],
  ["Kontinue Live", `${AI_USAGE_CREDIT_COSTS.liveVoicePerSecond}/second`],
];

function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function openCheckout(tier: PlanTier, annual: boolean) {
  // Checkout stays on the hosted page (Clerk billing has no native SDK).
  void WebBrowser.openBrowserAsync(
    `${API_BASE_URL}/pricing?plan=${tier}&period=${annual ? "annual" : "monthly"}`,
  );
}

export default function PricingScreen() {
  const currentTier = usePlanTier();
  const { primary } = useTheme();
  const { width } = useWindowDimensions();
  const [annual, setAnnual] = useState(true);
  const [audience, setAudience] = useState<Audience>(() =>
    PLAN_CARD_PRESENTATION[currentTier].audience === "professional"
      ? "professional"
      : "personal",
  );
  const [compareTier, setCompareTier] = useState<PlanTier>(() => {
    const next = PLAN_TIERS[PLAN_TIERS.indexOf(currentTier) + 1];
    return next ?? currentTier;
  });

  const visibleTiers = PLAN_TIERS.filter(
    (tier) => PLAN_CARD_PRESENTATION[tier].audience === audience,
  );
  const bestSaving = Math.max(
    ...PLAN_TIERS.map((tier) => {
      const plan = PLAN_DEFINITIONS[tier];
      if (!plan.priceMonthlyCents) return 0;
      return Math.round(
        (1 - plan.priceAnnualMonthlyCents / plan.priceMonthlyCents) * 100,
      );
    }),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Ambient brand glow behind the header, like web /pricing */}
      <View pointerEvents="none" className="absolute left-0 right-0 top-0" style={{ height: 420 }}>
        <Svg width={width} height={420}>
          <Defs>
            <RadialGradient id="pricingGlow" cx="50%" cy="10%" r="60%">
              <Stop offset="0%" stopColor={primary} stopOpacity={0.18} />
              <Stop offset="100%" stopColor={primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="10%" r="60%" fill="url(#pricingGlow)" />
        </Svg>
      </View>

      <ScreenHeader title="Pricing" leading="back" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center px-2 pb-1 pt-3">
          <Text className="text-[11px] font-semibold uppercase tracking-[2.5px] text-primary">
            Pricing
          </Text>
          <Text className="mt-3 text-center text-[28px] font-semibold leading-[34px] tracking-tight text-foreground">
            Pick the right plan for your workflow
          </Text>
          <Text className="mt-2.5 text-center text-[13.5px] leading-5 text-muted-foreground">
            Start cheaply, see every real limit, and move up only when your work
            needs more models, context, or professional tools.
          </Text>
        </View>

        {/* Audience + billing period */}
        <View className="items-center gap-3">
          <Segmented
            options={AUDIENCES}
            value={audience}
            onChange={setAudience}
            inverted
          />
          <Segmented
            options={[
              { id: "monthly", label: "Monthly" },
              {
                id: "annual",
                label: bestSaving > 0 ? `Annual · save up to ${bestSaving}%` : "Annual",
              },
            ]}
            value={annual ? "annual" : "monthly"}
            onChange={(id) => setAnnual(id === "annual")}
          />
        </View>

        {visibleTiers.map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            annual={annual}
            current={currentTier === tier}
          />
        ))}

        {/* One shared balance */}
        <View className="mt-4">
          <Text className="text-center text-[11px] font-semibold uppercase tracking-[2.5px] text-primary">
            One shared balance
          </Text>
          <Text className="mt-2 text-center text-[22px] font-semibold tracking-tight text-foreground">
            What AI usage credits cover
          </Text>
          <View className="mt-5 gap-2.5">
            {CREDIT_EXPLAINERS.map(([title, copy]) => (
              <View key={title} className="rounded-2xl border border-foreground/8 bg-card p-4">
                <Text className="text-[14px] font-semibold text-foreground">{title}</Text>
                <Text className="mt-1.5 text-[12.5px] leading-[19px] text-muted-foreground">
                  {copy}
                </Text>
              </View>
            ))}
          </View>
          <View className="mt-3 flex-row flex-wrap overflow-hidden rounded-2xl border border-foreground/8 bg-card">
            {RATES.map(([label, value], index) => (
              <View
                key={label}
                className={cn(
                  "w-1/2 border-foreground/6 p-3.5",
                  index % 2 === 0 && "border-r",
                  index < RATES.length - 2 && "border-b",
                )}
              >
                <Text className="text-[11px] leading-4 text-muted-foreground">{label}</Text>
                <Text className="mt-1 text-[13.5px] font-semibold tabular-nums text-foreground">
                  {value}
                </Text>
              </View>
            ))}
          </View>
          <Text className="mt-2.5 text-[11.5px] leading-4 text-muted-foreground">
            Rates are per operation. Product-specific request, duration, and build
            ceilings also apply, so credits do not replace the limits below.
          </Text>
        </View>

        {/* Full comparison — one plan at a time reads better on a phone than
            web's five-column table. */}
        <View className="mt-4">
          <Text className="text-[11px] font-semibold uppercase tracking-[2.5px] text-primary">
            Full comparison
          </Text>
          <Text className="mt-2 text-[22px] font-semibold tracking-tight text-foreground">
            Every limit, written plainly
          </Text>
          <Text className="mt-1.5 text-[12.5px] leading-[19px] text-muted-foreground">
            Pick a plan to see everything it includes.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4 mt-4"
            contentContainerClassName="gap-1.5 px-4"
          >
            {PLAN_TIERS.map((tier) => {
              const selected = compareTier === tier;
              return (
                <Pressable
                  key={tier}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setCompareTier(tier)}
                  className={cn(
                    "h-9 flex-row items-center gap-1.5 rounded-full border px-4",
                    selected
                      ? "border-primary/40 bg-primary/15"
                      : "border-foreground/8 bg-foreground/4 active:bg-foreground/8",
                  )}
                >
                  <Text
                    className={cn(
                      "text-[12.5px] font-semibold",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {PLAN_DEFINITIONS[tier].name}
                  </Text>
                  {currentTier === tier ? (
                    <View className="h-1.5 w-1.5 rounded-full bg-primary" />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="mt-4 gap-3">
            {PRICING_COMPARISON_SECTIONS.map((section) => (
              <View
                key={section.title}
                className="overflow-hidden rounded-2xl border border-foreground/8 bg-card"
              >
                <View className="border-b border-foreground/6 bg-foreground/3 px-4 py-2.5">
                  <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {section.title}
                  </Text>
                </View>
                {section.rows.map((row, index) => (
                  <View
                    key={row.label}
                    className={cn(
                      "flex-row items-start gap-3 px-4 py-3",
                      index > 0 && "border-t border-foreground/6",
                    )}
                  >
                    <View className="flex-1">
                      <Text className="text-[13px] font-medium text-foreground">{row.label}</Text>
                      {row.description ? (
                        <Text className="mt-0.5 text-[11px] leading-4 text-muted-foreground/80">
                          {row.description}
                        </Text>
                      ) : null}
                    </View>
                    <View className="max-w-[46%] items-end pt-0.5">
                      <ComparisonValue value={row.values[compareTier]} />
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Text className="mt-3 text-[11.5px] leading-4 text-muted-foreground">
            Request ceilings and AI usage credits both apply. Limits reset monthly
            at 00:00 UTC; daily upload limits reset each day.
          </Text>
          {compareTier !== currentTier && compareTier !== "free" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openCheckout(compareTier, annual)}
              className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:opacity-90"
              style={{
                ...softShadow({ color: primary, opacity: 0.35, radius: 14, offsetY: 6 }),
              }}
            >
              <Text className="text-[14px] font-semibold text-primary-foreground">
                Choose {PLAN_DEFINITIONS[compareTier].name}
              </Text>
              <Icon as={ExternalLink} size={14} className="text-primary-foreground" />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  inverted = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Web's audience switch: the active pill is foreground-on-background. */
  inverted?: boolean;
}) {
  return (
    <View className="flex-row rounded-full border border-foreground/8 bg-foreground/4 p-1">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            className={cn(
              "min-h-10 justify-center rounded-full px-4",
              selected && (inverted ? "bg-foreground" : "bg-background"),
            )}
          >
            <Text
              className={cn(
                "text-[12.5px] font-semibold",
                selected
                  ? inverted
                    ? "text-background"
                    : "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlanCard({
  tier,
  annual,
  current,
}: {
  tier: PlanTier;
  annual: boolean;
  current: boolean;
}) {
  const { primary } = useTheme();
  const plan = PLAN_DEFINITIONS[tier];
  const presentation = PLAN_CARD_PRESENTATION[tier];
  const monthlyCents = annual ? plan.priceAnnualMonthlyCents : plan.priceMonthlyCents;
  const highlighted = presentation.highlighted;
  return (
    <View
      className={cn(
        "overflow-hidden rounded-[24px] border bg-card p-5",
        highlighted ? "border-primary/45" : "border-foreground/8",
      )}
      style={
        highlighted
          ? {
              ...softShadow({ color: primary, opacity: 0.28, radius: 22, offsetY: 8 }),
            }
          : undefined
      }
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[19px] font-semibold tracking-tight text-foreground">
              {plan.name}
            </Text>
            {highlighted ? (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <Text className="text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                  Popular
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-1 text-[12px] font-medium text-primary">
            {presentation.bestFor}
          </Text>
        </View>
        {current ? (
          <View className="flex-row items-center gap-1 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1">
            <Icon as={Sparkles} size={10} className="text-primary" />
            <Text className="text-[10.5px] font-semibold text-primary">Current</Text>
          </View>
        ) : null}
      </View>
      <View className="mt-4 flex-row items-end gap-1">
        <Text className="text-[34px] font-semibold tracking-tight text-foreground">
          {formatPrice(monthlyCents)}
        </Text>
        <Text className="mb-2 text-[12px] text-muted-foreground">/ month</Text>
      </View>
      <Text className="text-[11px] text-muted-foreground">
        {plan.priceMonthlyCents === 0
          ? "Free forever"
          : annual
            ? `Billed ${formatPrice(plan.priceAnnualCents)} yearly`
            : "Billed monthly"}
      </Text>
      <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
        {presentation.description}
      </Text>
      <View className="mt-4 gap-2.5 border-t border-foreground/6 pt-4">
        {getPlanCardHighlights(tier).map((highlight) => (
          <View key={highlight} className="flex-row items-start gap-2.5">
            <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary/12">
              <Icon as={Check} size={11} strokeWidth={2.75} className="text-primary" />
            </View>
            <Text className="flex-1 text-[12.5px] leading-5 text-foreground/85">{highlight}</Text>
          </View>
        ))}
      </View>
      {!current && tier !== "free" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => openCheckout(tier, annual)}
          className={cn(
            "mt-5 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4",
            highlighted
              ? "bg-primary active:opacity-90"
              : "border border-foreground/10 bg-foreground/5 active:bg-foreground/10",
          )}
        >
          <Text
            className={cn(
              "text-[13.5px] font-semibold",
              highlighted ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {presentation.cta}
          </Text>
          <Icon
            as={ExternalLink}
            size={14}
            className={highlighted ? "text-primary-foreground" : "text-muted-foreground"}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function ComparisonValue({ value }: { value: PricingComparisonValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <View className="h-6 w-6 items-center justify-center rounded-full bg-primary/12">
        <Icon as={Check} size={13} strokeWidth={2.75} className="text-primary" />
      </View>
    ) : (
      <Text className="text-[12.5px] text-muted-foreground/50">Not included</Text>
    );
  }
  return (
    <Text
      className={cn(
        "text-right text-[12.5px] leading-[18px]",
        value === "Not included"
          ? "text-muted-foreground/50"
          : "font-semibold text-foreground",
      )}
    >
      {value}
    </Text>
  );
}
