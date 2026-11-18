import { memo, useEffect, useState } from "react";
import { type GestureResponderEvent, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Pencil,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Square,
  Volume2,
} from "lucide-react-native";
import type {
  ClockData,
  EmailDraft,
  GeneratedFile,
  MessageAttachment,
} from "@repo/core/chat-message-parts";
import { formatFileBytes } from "@repo/core/chat-message-parts";

import { ClockWidget } from "@/components/chat/clock-widget";
import { EmailComposer } from "@/components/chat/email-composer";
import { Markdown, withAlpha } from "@/components/chat/markdown";
import { ImageLightbox } from "@/components/media/image-lightbox";
import { useTheme } from "@/components/theme-provider";
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  useDropdown,
} from "@/components/ui/dropdown";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { isSpeechAvailable, useTextToSpeech } from "@/hooks/use-text-to-speech";
import { showAppErrorToast } from "@/lib/app-errors";
import { openRemoteFile, shareMediaFile } from "@/lib/media-share";
import { cn } from "@/lib/utils";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningText?: string;
  /** Images the assistant generated. */
  images: string[];
  /** Files the user attached to their own message. */
  attachments: MessageAttachment[];
  isImported: boolean;
  clockData: ClockData | null;
  emailDraft: EmailDraft | null;
  generatedFiles: GeneratedFile[];
};

type ChatMessageProps = {
  message: DisplayMessage;
  /** This bubble is the one currently streaming. */
  isStreaming: boolean;
  /** Hide actions while any turn is streaming. */
  actionsHidden: boolean;
  reasoningEnabled: boolean;
  onEdit?: (message: DisplayMessage) => void;
  onRetry?: (message: DisplayMessage) => void;
  onSwitchModel?: (message: DisplayMessage) => void;
};

/**
 * One chat turn, mirroring web ChatMessage: gradient user pill, frosted
 * assistant card, thinking accordion, generated media and files, and the
 * Copy / Edit / Speak / Retry action row under the bubble.
 */
function ChatMessageComponent({
  message,
  isStreaming,
  actionsHidden,
  reasoningEnabled,
  onEdit,
  onRetry,
  onSwitchModel,
}: ChatMessageProps) {
  const { primary, tokens, isDark } = useTheme();
  const isUser = message.role === "user";
  const content = message.content;
  const hasContent = content.trim().length > 0;
  const imageAttachments = message.attachments.filter((a) =>
    a.mediaType.startsWith("image/"),
  );
  const documentAttachments = message.attachments.filter(
    (a) => !a.mediaType.startsWith("image/"),
  );
  const showThinking =
    !isUser &&
    (Boolean(message.reasoningText) ||
      (reasoningEnabled && isStreaming && !hasContent));
  const hasAnyOutput =
    hasContent ||
    message.images.length > 0 ||
    message.generatedFiles.length > 0 ||
    !!message.clockData ||
    !!message.emailDraft;
  const isEmptyResponse =
    !isUser && !isStreaming && !hasAnyOutput && !message.reasoningText;

  return (
    <View className={cn("py-1.5", isUser ? "items-end" : "items-start")}>
      <View style={{ maxWidth: isUser ? "86%" : "94%" }}>
        {isUser ? (
          <LinearGradient
            colors={[withAlpha(primary, 0.17), withAlpha(primary, 0.07)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: withAlpha(primary, 0.25),
              paddingHorizontal: imageAttachments.length && !hasContent ? 10 : 16,
              paddingVertical: imageAttachments.length && !hasContent ? 10 : 11,
            }}
          >
            {imageAttachments.length > 0 ? (
              <AttachmentImages images={imageAttachments} />
            ) : null}
            {documentAttachments.length > 0 ? (
              <DocumentChips documents={documentAttachments} />
            ) : null}
            {hasContent ? (
              <Text selectable className="text-[15px] leading-[23px] text-foreground">
                {content}
              </Text>
            ) : null}
          </LinearGradient>
        ) : (
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: withAlpha(tokens.foreground, isDark ? 0.08 : 0.07),
              backgroundColor: withAlpha(tokens.card, 0.6),
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            {showThinking ? (
              <ThinkingAccordion
                reasoningText={message.reasoningText}
                active={isStreaming && !hasContent}
              />
            ) : null}
            {hasContent ? <Markdown>{content}</Markdown> : null}
            {isStreaming && hasContent ? <StreamingCaret /> : null}
            {isStreaming && !hasAnyOutput && !showThinking ? <TypingDots /> : null}
            {isEmptyResponse ? (
              <Text className="text-[14px] italic leading-5 text-muted-foreground">
                No response was returned. Please retry or switch models.
              </Text>
            ) : null}
            {message.images.length > 0 ? (
              <GeneratedImages images={message.images} />
            ) : null}
            {message.clockData ? (
              <ClockWidget timezone={message.clockData.timezone} />
            ) : null}
            {message.emailDraft ? <EmailComposer draft={message.emailDraft} /> : null}
            {message.generatedFiles.length > 0 ? (
              <GeneratedFiles files={message.generatedFiles} />
            ) : null}
          </View>
        )}

        {!actionsHidden && !isStreaming ? (
          <MessageActions
            message={message}
            onEdit={onEdit}
            onRetry={onRetry}
            onSwitchModel={onSwitchModel}
          />
        ) : null}
      </View>
    </View>
  );
}

export const ChatMessage = memo(ChatMessageComponent);

/* ─── Thinking ─────────────────────────────────────────────────────────── */

/** Web ThinkingAccordion: live "Thinking for Ns…", then "Thought for Ns". */
export function ThinkingAccordion({
  reasoningText,
  active,
}: {
  reasoningText?: string;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Lazy state, not Date.now() in render (React Compiler rule).
  const [startedAt] = useState(() => Date.now());
  const [startedActive] = useState(active);
  const [now, setNow] = useState(startedAt);
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useEffect(() => {
    if (active) {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
    // Lock the duration once thinking ends (deferred out of the effect body).
    const timer = setTimeout(() => {
      setEndedAt((previous) => previous ?? Date.now());
      setOpen(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [active]);

  const estimated = Math.max(1, Math.round((reasoningText?.length ?? 150) / 150));
  const seconds = !startedActive
    ? estimated
    : Math.max(1, Math.round(((endedAt ?? now) - startedAt) / 1000));
  const label = active ? `Thinking for ${seconds}s…` : `Thought for ${seconds}s`;

  return (
    <View className="mb-2.5 overflow-hidden rounded-xl border border-foreground/10 bg-foreground/3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center gap-2 px-3 py-2 active:bg-foreground/5"
      >
        <PulsingBrain active={active} />
        <Text
          className={cn(
            "flex-1 text-[12px]",
            active ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
          )}
        >
          {label}
        </Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
        </View>
      </Pressable>
      {open ? (
        <ScrollView
          nestedScrollEnabled
          style={{ maxHeight: 240 }}
          className="border-t border-foreground/5"
        >
          <Text className="px-3 py-2 font-mono text-[11px] leading-[17px] text-muted-foreground">
            {reasoningText?.trim() || `Thinking completed in ${seconds}s.`}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function PulsingBrain({ active }: { active: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(
      active
        ? withRepeat(
            withSequence(
              withTiming(0.35, { duration: 700 }),
              withTiming(1, { duration: 700 }),
            ),
            -1,
          )
        : withTiming(1, { duration: 200 }),
    );
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={style}>
      <Icon
        as={Brain}
        size={14}
        className={active ? "text-primary" : "text-muted-foreground"}
      />
    </Animated.View>
  );
}

/** The web `typing-dot` bounce, shown before the first token. */
export function TypingDots() {
  return (
    <View className="flex-row items-center gap-1.5 py-1.5" accessibilityLabel="Generating">
      {[0, 1, 2].map((index) => (
        <TypingDot key={index} delay={index * 140} />
      ))}
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const { primary } = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 260 }),
          ),
          -1,
        ),
      ),
    );
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.get() * 0.65,
    transform: [{ translateY: -progress.get() * 4 }],
  }));
  return (
    <Animated.View
      style={[
        { width: 7, height: 7, borderRadius: 4, backgroundColor: primary },
        style,
      ]}
    />
  );
}

function StreamingCaret() {
  const { primary } = useTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(
      withRepeat(
        withSequence(withTiming(0.2, { duration: 520 }), withTiming(1, { duration: 520 })),
        -1,
      ),
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        { width: 7, height: 15, borderRadius: 2, backgroundColor: primary, marginTop: 2 },
        style,
      ]}
    />
  );
}

/* ─── Media + files ────────────────────────────────────────────────────── */

function AttachmentImages({ images }: { images: MessageAttachment[] }) {
  const [openUri, setOpenUri] = useState<string | null>(null);
  const single = images.length === 1;
  return (
    <>
      <View className="mb-2 flex-row flex-wrap justify-end gap-2">
        {images.map((image) => (
          <Pressable
            key={image.url.slice(0, 96)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open ${image.filename}`}
            onPress={() => setOpenUri(image.url)}
            className="active:opacity-85"
          >
            <Image
              source={{ uri: image.url }}
              style={{
                width: single ? 200 : 110,
                height: single ? 200 : 110,
                borderRadius: 14,
              }}
              contentFit="cover"
              transition={120}
            />
          </Pressable>
        ))}
      </View>
      <ImageLightbox
        uri={openUri}
        visible={openUri !== null}
        onClose={() => setOpenUri(null)}
      />
    </>
  );
}

function DocumentChips({ documents }: { documents: MessageAttachment[] }) {
  return (
    <View className="mb-2 gap-1.5">
      {documents.map((document) => (
        <Pressable
          key={document.url.slice(0, 96)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${document.filename}`}
          onPress={() =>
            void openRemoteFile(document.url).catch(showAppErrorToast)
          }
          className="flex-row items-center gap-2.5 rounded-xl border border-foreground/8 bg-background/40 px-2.5 py-2 active:opacity-80"
        >
          <View className="h-7 w-7 items-center justify-center rounded-lg bg-primary/12">
            <Icon as={FileText} size={14} className="text-primary" />
          </View>
          <Text numberOfLines={1} className="flex-1 text-[12.5px] font-medium text-foreground">
            {document.filename}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Web GeneratedImages: tap to open the lightbox, save from there. */
function GeneratedImages({ images }: { images: string[] }) {
  const [openUri, setOpenUri] = useState<string | null>(null);
  const single = images.length === 1;
  return (
    <>
      <View className="mt-1 flex-row flex-wrap gap-2">
        {images.map((uri, index) => (
          <Pressable
            key={`${index}-${uri.slice(-48)}`}
            accessibilityRole="imagebutton"
            accessibilityLabel="Open generated image"
            onPress={() => setOpenUri(uri)}
            className="overflow-hidden rounded-2xl border border-foreground/8 active:opacity-90"
          >
            <Image
              source={{ uri }}
              style={{ width: single ? 260 : 130, height: single ? 260 : 130 }}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ))}
      </View>
      <ImageLightbox
        uri={openUri}
        visible={openUri !== null}
        onClose={() => setOpenUri(null)}
        downloadName="kontinue-generated"
      />
    </>
  );
}

/** Web GeneratedFiles: download cards for run_code sandbox output. */
function GeneratedFiles({ files }: { files: GeneratedFile[] }) {
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const handleOpen = async (file: GeneratedFile) => {
    if (busyUrl) return;
    setBusyUrl(file.url);
    try {
      await shareMediaFile(file.url, { filename: file.name, fallbackExt: "bin" });
    } catch (error) {
      showAppErrorToast(error);
    } finally {
      setBusyUrl(null);
    }
  };
  return (
    <View className="mt-3 gap-2">
      {files.map((file) => (
        <Pressable
          key={file.url}
          accessibilityRole="button"
          accessibilityLabel={`Download ${file.name}`}
          onPress={() => void handleOpen(file)}
          className="flex-row items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/3 px-3 py-2.5 active:bg-foreground/6"
        >
          <View className="h-9 w-9 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/4">
            <Icon as={FileText} size={16} className="text-muted-foreground" />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[13.5px] font-medium text-foreground">
              {file.name}
            </Text>
            {file.bytes > 0 ? (
              <Text className="text-[11.5px] text-muted-foreground">
                {formatFileBytes(file.bytes)}
              </Text>
            ) : null}
          </View>
          <Icon
            as={Download}
            size={16}
            className={busyUrl === file.url ? "text-primary" : "text-muted-foreground"}
          />
        </Pressable>
      ))}
    </View>
  );
}

/* ─── Actions ──────────────────────────────────────────────────────────── */

function MessageActions({
  message,
  onEdit,
  onRetry,
  onSwitchModel,
}: {
  message: DisplayMessage;
  onEdit?: (message: DisplayMessage) => void;
  onRetry?: (message: DisplayMessage) => void;
  onSwitchModel?: (message: DisplayMessage) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const retryMenu = useDropdown();
  const { isSpeaking, speechText, handleSpeak } = useTextToSpeech(
    isUser ? "" : message.content,
  );

  const handleCopy = () => {
    void Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      className={cn(
        "mt-1 flex-row flex-wrap items-center gap-0.5",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {message.content.trim() ? (
        <ActionPill
          icon={copied ? Check : Copy}
          label={copied ? "Copied" : "Copy"}
          onPress={handleCopy}
          active={copied}
        />
      ) : null}
      {isUser && onEdit ? (
        <ActionPill icon={Pencil} label="Edit" onPress={() => onEdit(message)} />
      ) : null}
      {!isUser ? (
        <>
          {isSpeechAvailable() ? (
            <ActionPill
              icon={isSpeaking ? Square : Volume2}
              label={isSpeaking ? "Stop" : "Speak"}
              onPress={handleSpeak}
              disabled={!speechText}
              active={isSpeaking}
            />
          ) : null}
          {onRetry ? (
            <ActionPill
              icon={RefreshCw}
              label="Retry"
              onPress={(event) => retryMenu.open(event)}
            />
          ) : null}
        </>
      ) : null}
      {message.isImported ? (
        <View className="ml-1 rounded-full border border-foreground/8 bg-foreground/5 px-2 py-0.5">
          <Text className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Imported
          </Text>
        </View>
      ) : null}

      <Dropdown
        visible={retryMenu.visible}
        anchor={retryMenu.anchor}
        onClose={retryMenu.close}
        width={196}
      >
        <DropdownItem
          icon={RotateCcw}
          label="Try again"
          onPress={() => {
            retryMenu.close();
            onRetry?.(message);
          }}
        />
        {onSwitchModel ? (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={Shuffle}
              label="Switch model"
              onPress={() => {
                retryMenu.close();
                onSwitchModel(message);
              }}
            />
          </>
        ) : null}
      </Dropdown>
    </View>
  );
}

function ActionPill({
  icon,
  label,
  onPress,
  disabled = false,
  active = false,
}: {
  icon: typeof Copy;
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      className={cn(
        "min-h-8 flex-row items-center gap-1.5 rounded-full px-2.5 active:bg-foreground/8",
        disabled && "opacity-40",
      )}
    >
      <Icon
        as={icon}
        size={12}
        strokeWidth={2.4}
        className={active ? "text-primary" : "text-muted-foreground"}
      />
      <Text
        className={cn(
          "text-[11.5px] font-medium",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
