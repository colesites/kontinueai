import { useEffect, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CircleAlert,
  CircleCheck,
  Info,
  X,
  type LucideIcon,
} from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { GlassView } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Native counterpart of the web app's sonner toasts: a glass card that drops
 * in under the status bar, optionally carrying one action (e.g. "Upgrade to
 * Pro"). Callable from anywhere, including non-React code, via `toast.*`.
 */

export type ToastVariant = "default" | "success" | "error" | "info" | "loading";

export type ToastOptions = {
  description?: string;
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Loading toasts stay until dismissed. */
  duration?: number;
  /** Reuse an id to replace a toast in place (e.g. loading → success). */
  id?: string;
};

type ToastItem = ToastOptions & {
  id: string;
  title: string;
  variant: ToastVariant;
};

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4200;

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return items;
}

function show(title: string, variant: ToastVariant, options: ToastOptions = {}) {
  counter += 1;
  const id = options.id ?? `toast-${counter}`;
  const next: ToastItem = { ...options, id, title, variant };
  const existing = items.findIndex((item) => item.id === id);
  items =
    existing === -1
      ? [next, ...items].slice(0, MAX_VISIBLE)
      : items.map((item) => (item.id === id ? next : item));
  emit();
  return id;
}

function dismiss(id?: string) {
  items = id ? items.filter((item) => item.id !== id) : [];
  emit();
}

export const toast = Object.assign(
  (title: string, options?: ToastOptions) => show(title, "default", options),
  {
    success: (title: string, options?: ToastOptions) =>
      show(title, "success", options),
    error: (title: string, options?: ToastOptions) =>
      show(title, "error", options),
    info: (title: string, options?: ToastOptions) => show(title, "info", options),
    loading: (title: string, options?: ToastOptions) =>
      show(title, "loading", options),
    dismiss,
  },
);

const VARIANT_ICON: Record<ToastVariant, LucideIcon | null> = {
  default: null,
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  loading: null,
};

/** Mounted once at the root; renders the live toast stack. */
export function Toaster() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const insets = useSafeAreaInsets();

  if (current.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 12,
        right: 12,
        gap: 8,
        zIndex: 1000,
        elevation: 1000,
      }}
    >
      {current.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </View>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const { isDark, primary, destructive } = useTheme();
  const icon = VARIANT_ICON[item.variant];
  const duration =
    item.variant === "loading" ? null : (item.duration ?? DEFAULT_DURATION);

  useEffect(() => {
    if (duration === null) return;
    const timer = setTimeout(() => dismiss(item.id), duration);
    return () => clearTimeout(timer);
  }, [duration, item.id, item.title, item.description]);

  const accent = item.variant === "error" ? destructive : primary;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18).stiffness(220)}
      exiting={FadeOutUp.duration(180)}
      layout={LinearTransition.springify().damping(20)}
      style={{
        borderRadius: 18,
        shadowColor: "#000",
        shadowOpacity: isDark ? 0.45 : 0.16,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      }}
    >
      <GlassView
        intensity={55}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
          backgroundColor: isDark ? "rgba(12,9,12,0.88)" : "rgba(255,251,253,0.92)",
        }}
      >
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={
            item.description ? `${item.title}. ${item.description}` : item.title
          }
          onPress={() => dismiss(item.id)}
          className="flex-row items-start gap-3 px-3.5 py-3"
        >
          {item.variant === "loading" ? (
            <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-primary/12">
              <ActivityIndicator size="small" color={primary} />
            </View>
          ) : icon ? (
            <View
              className={cn(
                "mt-0.5 h-7 w-7 items-center justify-center rounded-full",
                item.variant === "error" ? "bg-destructive/12" : "bg-primary/12",
              )}
            >
              <Icon
                as={icon}
                size={15}
                color={accent}
                strokeWidth={2.25}
              />
            </View>
          ) : null}
          <View className="min-w-0 flex-1 gap-0.5 pt-0.5">
            <Text className="text-[13.5px] font-semibold leading-5 text-foreground">
              {item.title}
            </Text>
            {item.description ? (
              <Text className="text-[12.5px] leading-[18px] text-muted-foreground">
                {item.description}
              </Text>
            ) : null}
            {item.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  dismiss(item.id);
                  item.action?.onPress();
                }}
                className="mt-2 self-start rounded-full bg-primary px-3.5 py-1.5 active:opacity-85"
                style={{
                  shadowColor: primary,
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 3,
                }}
              >
                <Text className="text-[12px] font-semibold text-primary-foreground">
                  {item.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View className="h-6 w-6 items-center justify-center rounded-full">
            <Icon as={X} size={13} className="text-muted-foreground/70" />
          </View>
        </Pressable>
      </GlassView>
    </Animated.View>
  );
}
