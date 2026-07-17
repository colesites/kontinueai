import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import {
  AI_USAGE_CREDIT_COSTS,
} from "@repo/core/ai-usage-credits";
import {
  getPlanCardHighlights,
  PLAN_CARD_PRESENTATION,
  PLAN_DEFINITIONS,
} from "@repo/core/plan-config";
import type { PlanTier } from "@repo/core/plan-tier";
import { Check, ExternalLink, Sparkles } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { API_BASE_URL } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

const TIERS: PlanTier[] = ["free", "starter", "plus", "pro", "max"];

export default function PricingScreen() {
  const currentTier = usePlanTier();
  const [annual, setAnnual] = useState(true);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScreenHeader title="Pricing" leading="back" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-14"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center px-3 pb-2 pt-3">
          <View className="flex-row items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5">
            <Icon as={Sparkles} size={13} className="text-primary" />
            <Text className="text-[10.5px] font-semibold uppercase tracking-widest text-primary">
              Plans
            </Text>
          </View>
          <Text className="mt-4 text-center text-[27px] font-semibold tracking-tight text-foreground">
            Pick the right plan for your workflow
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
            Every real limit is shown. Upgrade only when your work needs more
            models, context, or professional tools.
          </Text>
          <View className="mt-5 flex-row rounded-xl bg-secondary p-1">
            {([false, true] as const).map((value) => (
              <Pressable
                key={String(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: annual === value }}
                onPress={() => setAnnual(value)}
                className={cn(
                  "min-h-10 justify-center rounded-lg px-4",
                  annual === value && "bg-background",
                )}
              >
                <Text
                  className={cn(
                    "text-[12px] font-semibold",
                    annual === value ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {value ? "Annual · save" : "Monthly"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {TIERS.map((tier) => {
          const plan = PLAN_DEFINITIONS[tier];
          const presentation = PLAN_CARD_PRESENTATION[tier];
          const monthlyCents = annual
            ? plan.priceAnnualMonthlyCents
            : plan.priceMonthlyCents;
          const current = currentTier === tier;
          return (
            <View
              key={tier}
              className={cn(
                "overflow-hidden rounded-2xl border bg-card p-4",
                presentation.highlighted
                  ? "border-primary/50"
                  : "border-border",
              )}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[18px] font-semibold text-foreground">
                    {plan.name}
                  </Text>
                  <Text className="mt-1 text-[11.5px] font-medium text-primary">
                    {presentation.bestFor}
                  </Text>
                </View>
                {current ? (
                  <View className="rounded-full bg-primary/12 px-2.5 py-1">
                    <Text className="text-[10.5px] font-semibold text-primary">
                      Current
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="mt-4 flex-row items-end gap-1">
                <Text className="text-[30px] font-semibold tracking-tight text-foreground">
                  {monthlyCents === 0
                    ? "$0"
                    : `$${(monthlyCents / 100).toFixed(2)}`}
                </Text>
                <Text className="mb-1.5 text-[11.5px] text-muted-foreground">
                  / month
                </Text>
              </View>
              {annual && plan.priceAnnualCents > 0 ? (
                <Text className="mt-0.5 text-[10.5px] text-muted-foreground">
                  Billed ${(plan.priceAnnualCents / 100).toFixed(2)} yearly
                </Text>
              ) : null}
              <Text className="mt-3 text-[12.5px] leading-5 text-muted-foreground">
                {presentation.description}
              </Text>
              <View className="mt-4 gap-2.5 border-t border-border pt-4">
                {getPlanCardHighlights(tier).map((highlight) => (
                  <View key={highlight} className="flex-row items-start gap-2.5">
                    <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                      <Icon as={Check} size={12} className="text-primary" />
                    </View>
                    <Text className="flex-1 text-[12px] leading-5 text-foreground/85">
                      {highlight}
                    </Text>
                  </View>
                ))}
              </View>
              {!current && tier !== "free" ? (
                <Pressable
                  onPress={() =>
                    void WebBrowser.openBrowserAsync(`${API_BASE_URL}/pricing`)
                  }
                  className="mt-5 min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 active:opacity-90"
                >
                  <Text className="text-[13px] font-semibold text-primary-foreground">
                    {presentation.cta}
                  </Text>
                  <Icon as={ExternalLink} size={14} className="text-primary-foreground" />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <View className="rounded-2xl border border-border bg-card p-4">
          <Text className="text-[16px] font-semibold text-foreground">
            One shared AI balance
          </Text>
          <Text className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
            Chat, search, media, Live, Canvas, and Kode draw from the same
            monthly usage credits.
          </Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            <Rate label="Basic request" value={AI_USAGE_CREDIT_COSTS.chatRequest.basic} />
            <Rate label="Pro request" value={AI_USAGE_CREDIT_COSTS.chatRequest.pro} />
            <Rate label="Frontier" value={AI_USAGE_CREDIT_COSTS.chatRequest.frontier} />
            <Rate label="Web search" value={AI_USAGE_CREDIT_COSTS.webSearch} />
            <Rate label="K-Image" value={AI_USAGE_CREDIT_COSTS.imageGeneration} />
            <Rate label="Kode unit" value={AI_USAGE_CREDIT_COSTS.kodeCredit} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Rate({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-xl bg-secondary p-3">
      <Text className="text-[10.5px] text-muted-foreground">{label}</Text>
      <Text className="mt-1 text-[14px] font-semibold text-foreground">
        {value} credit{value === 1 ? "" : "s"}
      </Text>
    </View>
  );
}
