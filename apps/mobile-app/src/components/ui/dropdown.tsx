import { useState, type ReactNode } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
} from "react-native";

import { withAlpha } from "@/components/chat/markdown";
import { GlassView } from "@/components/ui/glass";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react-native";
import { softShadow } from "@/lib/shadow";

export type DropdownAnchor = { x: number; y: number };

/** Capture a press position to anchor a dropdown at. */
export function anchorFromEvent(event: GestureResponderEvent): DropdownAnchor {
  return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
}

const MENU_WIDTH = 224; // w-56, matches the web dropdown panels
const SCREEN_MARGIN = 8;

/**
 * Anchored dropdown — the mobile analogue of the web's DropdownMenu. Renders
 * a positioned glass panel near the press point instead of a bottom sheet,
 * mirroring SidebarChatActionsMenu / the chat-input "+" menu on web.
 */
export function Dropdown({
  visible,
  onClose,
  anchor,
  placement = "auto",
  width = MENU_WIDTH,
  left: leftOverride,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  anchor: DropdownAnchor | null;
  /** "above" opens upward from the anchor (used by the account footer). */
  placement?: "auto" | "above";
  width?: number;
  /** Pin the horizontal position (e.g. full-width sidebar menus). */
  left?: number;
  children: ReactNode;
}) {
  const { tokens } = useTheme();
  const screen = Dimensions.get("window");

  const left =
    leftOverride ??
    Math.min(
      Math.max(SCREEN_MARGIN, (anchor?.x ?? SCREEN_MARGIN) - width + 24),
      screen.width - width - SCREEN_MARGIN,
    );
  const openAbove =
    placement === "above" ||
    (anchor ? anchor.y > screen.height * 0.6 : false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1" onPress={onClose}>
        <View
          style={{
            position: "absolute",
            width,
            left,
            ...(openAbove
              ? { bottom: screen.height - (anchor?.y ?? 0) + 8 }
              : { top: (anchor?.y ?? 0) + 8 }),
            borderRadius: 16,
            ...softShadow({ color: "#000", opacity: 0.4, radius: 24, offsetY: 8 }),
          }}
        >
          {/* Web menus: `glass bg-background/40 backdrop-blur-3xl rounded-2xl
              border-foreground/10`. iOS gets that heavy blur through a thin
              tint; Android can't blur the app behind (see WEB_PARITY.md), so
              it keeps the glass nearly opaque to stay readable. */}
          <GlassView
            intensity={Platform.OS === "ios" ? 90 : 50}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: withAlpha(tokens.foreground, 0.1),
              backgroundColor: withAlpha(
                tokens.background,
                Platform.OS === "ios" ? 0.4 : 0.94,
              ),
              padding: 4,
            }}
          >
            <ScrollView
              style={{ maxHeight: screen.height * 0.5 }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </GlassView>
        </View>
      </Pressable>
    </Modal>
  );
}

export function DropdownItem({
  icon,
  label,
  onPress,
  destructive = false,
  active = false,
  disabled = false,
  trailing,
}: {
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  active?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "flex-row items-center gap-2 rounded-lg px-2.5 py-2 active:bg-foreground/6",
        disabled && "opacity-50",
      )}
    >
      {icon ? (
        <Icon
          as={icon}
          size={15}
          className={
            destructive
              ? "text-destructive"
              : active
                ? "text-primary"
                : "text-muted-foreground"
          }
        />
      ) : null}
      <Text
        numberOfLines={1}
        className={cn(
          "flex-1 text-[13px]",
          destructive
            ? "text-destructive"
            : active
              ? "font-medium text-primary"
              : "text-foreground",
        )}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

export function DropdownSeparator() {
  return <View className="my-1 h-px bg-foreground/8" />;
}

/** Convenience hook bundling open state + anchor capture. */
export function useDropdown() {
  const [state, setState] = useState<{
    visible: boolean;
    anchor: DropdownAnchor | null;
  }>({ visible: false, anchor: null });

  return {
    visible: state.visible,
    anchor: state.anchor,
    open: (event: GestureResponderEvent) =>
      setState({ visible: true, anchor: anchorFromEvent(event) }),
    /** Open at a measured point (e.g. the top edge of a footer row). */
    openAt: (anchor: DropdownAnchor) => setState({ visible: true, anchor }),
    close: () => setState((current) => ({ ...current, visible: false })),
  };
}
