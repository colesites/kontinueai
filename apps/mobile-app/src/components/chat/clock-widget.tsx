import { Clock3 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function ClockWidget({ timezone }: { timezone?: string | null }) {
  const resolvedTimezone = useMemo(() => {
    if (timezone && validTimezone(timezone)) return timezone;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, [timezone]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: resolvedTimezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  const date = new Intl.DateTimeFormat(undefined, {
    timeZone: resolvedTimezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const label = resolvedTimezone.split("/").at(-1)?.replace(/_/g, " ");

  return (
    <View className="mt-3 w-64 rounded-2xl border border-border bg-secondary/70 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon as={Clock3} size={14} className="text-primary" />
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-primary">
            Clock
          </Text>
        </View>
        <Text className="text-[10.5px] text-muted-foreground">{label}</Text>
      </View>
      <Text className="mt-4 text-[30px] font-semibold tracking-tight text-foreground">
        {time}
      </Text>
      <Text className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
        {date}
      </Text>
    </View>
  );
}
