import { memo, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { Image } from "expo-image";
import MarkdownDisplay, { type ASTNode, type RenderRules } from "react-native-markdown-display";
import { Check, Copy } from "lucide-react-native";

import { ImageLightbox } from "@/components/media/image-lightbox";
import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { CODE_THEME, highlightCode } from "@/lib/code-highlight";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/** `#rrggbb` token + alpha (0..1) → `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

// Citation icons (favicons, site logos) that models drop into answers. On web
// these shrink to a chip; here they are dropped and the link carries the label.
const CITATION_ICON_SRC_REGEX =
  /(?:favicon|apple-touch-icon|\/s2\/favicons|[/_-](?:icon|logo)s?[/_.-])|\.ico(?:$|\?)/i;
const CITATION_COUNT_ALT_REGEX = /\s*\+\d+\s*$/;
const DOMAIN_ALT_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const FILE_EXTENSION_ALT_REGEX =
  /\.(?:png|jpe?g|gif|webp|heic|svg|pdf|csv|xlsx?|docx?|txt|md|zip|json)$/i;

function isCitationIcon(src: string, alt: string): boolean {
  return (
    CITATION_ICON_SRC_REGEX.test(src) ||
    CITATION_COUNT_ALT_REGEX.test(alt) ||
    (DOMAIN_ALT_REGEX.test(alt.trim()) && !FILE_EXTENSION_ALT_REGEX.test(alt.trim()))
  );
}

function nodeText(node: ASTNode): string {
  if (node.type === "image") return String(node.attributes?.alt ?? "");
  if (node.content) return node.content;
  return (node.children ?? []).map(nodeText).join("");
}

function domainOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function openLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  void WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}

/**
 * Themed markdown for assistant messages. Every color resolves from the active
 * theme tokens (the same ones web's prose styles read), links render as
 * compact source citations like web's PillLink, and code fences get the web
 * CodeBlock header with a copy button.
 */
function MarkdownComponent({ children }: { children: string }) {
  const { tokens, primary } = useTheme();
  const { width } = useWindowDimensions();

  const foreground = tokens.foreground;
  const muted = tokens["muted-foreground"];
  const codeBg = withAlpha(foreground, 0.06);
  const border = withAlpha(foreground, 0.1);

  const rules: RenderRules = {
    link: (node) => {
      const href = String(node.attributes?.href ?? "");
      const raw = nodeText(node).trim();
      const isBare = !raw || raw === href || /^https?:\/\//i.test(raw);
      const label = isBare ? domainOf(href) : raw.replace(CITATION_COUNT_ALT_REGEX, (m) => ` ${m.trim()}`);
      return (
        <Text
          key={node.key}
          accessibilityRole="link"
          onPress={() => openLink(href)}
          style={{
            color: primary,
            fontWeight: "500",
            textDecorationLine: "none",
          }}
        >
          {label}
          <Text style={{ color: withAlpha(primary, 0.7), fontSize: 12 }}>{" ↗"}</Text>
        </Text>
      );
    },
    image: (node) => {
      const src = String(node.attributes?.src ?? "");
      const alt = String(node.attributes?.alt ?? "");
      if (!src || isCitationIcon(src, alt)) return null;
      return <MarkdownImage key={node.key} src={src} alt={alt} border={border} />;
    },
    fence: (node) => (
      <CodeBlock
        key={node.key}
        code={node.content.replace(/\n$/, "")}
        language={String((node as ASTNode & { sourceInfo?: string }).sourceInfo ?? "").trim()}
      />
    ),
    code_block: (node) => (
      <CodeBlock key={node.key} code={node.content.replace(/\n$/, "")} language="" />
    ),
  };

  return (
    <MarkdownDisplay
      rules={rules}
      style={{
        body: { color: foreground, fontSize: 15, lineHeight: 23 },
        paragraph: { marginTop: 0, marginBottom: 10 },
        heading1: { color: foreground, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 6 },
        heading2: { color: foreground, fontSize: 19, fontWeight: "700", marginTop: 12, marginBottom: 6 },
        heading3: { color: foreground, fontSize: 16.5, fontWeight: "600", marginTop: 10, marginBottom: 4 },
        heading4: { color: foreground, fontSize: 15.5, fontWeight: "600", marginTop: 8, marginBottom: 4 },
        strong: { fontWeight: "700", color: foreground },
        em: { fontStyle: "italic" },
        blockquote: {
          backgroundColor: codeBg,
          borderLeftColor: withAlpha(primary, 0.5),
          borderLeftWidth: 3,
          paddingHorizontal: 12,
          paddingVertical: 4,
          marginBottom: 10,
          borderRadius: 6,
        },
        bullet_list: { marginBottom: 10 },
        ordered_list: { marginBottom: 10 },
        list_item: { marginBottom: 4, color: foreground },
        bullet_list_icon: { color: muted },
        ordered_list_icon: { color: muted },
        code_inline: {
          backgroundColor: codeBg,
          color: primary,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
          fontFamily: MONO,
          fontSize: 13,
        },
        hr: { backgroundColor: border, height: 1, marginVertical: 12 },
        table: {
          borderColor: border,
          borderWidth: 1,
          borderRadius: 8,
          marginBottom: 10,
          width: width - 32 - 28,
        },
        th: { padding: 8, color: foreground, fontWeight: "600", backgroundColor: codeBg },
        td: { padding: 8, color: foreground },
        tr: { borderColor: border, borderBottomWidth: 1 },
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}

export const Markdown = memo(MarkdownComponent);

/**
 * Web CodeBlock: the same always-dark GitHub panel, traffic-light dots,
 * language label and copy button, plus syntax colors (lib/code-highlight).
 */
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => highlightCode(code, language), [code, language]);

  const handleCopy = () => {
    void Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View
      className="mb-2.5 mt-1 overflow-hidden rounded-xl"
      style={{
        borderWidth: 1,
        borderColor: CODE_THEME.border,
        backgroundColor: CODE_THEME.background,
      }}
    >
      <View
        className="flex-row items-center gap-2.5 px-3 py-2"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: CODE_THEME.border,
          backgroundColor: CODE_THEME.header,
        }}
      >
        <View className="flex-row gap-1.5">
          {CODE_THEME.dots.map((color) => (
            <View
              key={color}
              style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }}
            />
          ))}
        </View>
        <Text
          numberOfLines={1}
          className="flex-1 font-mono text-[10.5px] uppercase tracking-wider"
          style={{ color: CODE_THEME.label }}
        >
          {language || "code"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied code" : "Copy code"}
          onPress={handleCopy}
          hitSlop={8}
          className="flex-row items-center gap-1 rounded-md px-2 py-1 active:bg-white/10"
        >
          <Icon as={copied ? Check : Copy} size={12} color={CODE_THEME.label} />
          <Text className="text-[11px] font-medium" style={{ color: CODE_THEME.label }}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          selectable
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: 19,
            color: CODE_THEME.tokens.plain,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          {highlighted.map((token, index) => (
            <Text
              // Tokens never reorder within a render, so the index is stable.
              key={index}
              style={{
                color: CODE_THEME.tokens[token.type],
                fontStyle: token.type === "comment" ? "italic" : "normal",
              }}
            >
              {token.text}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
}

function MarkdownImage({ src, alt, border }: { src: string; alt: string; border: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <Text className="text-[12.5px] italic text-muted-foreground">
        {alt.trim() || "Image"} unavailable
      </Text>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={alt || "Open image"}
        onPress={() => setOpen(true)}
        className="my-1.5 self-start"
      >
        <Image
          source={{ uri: src }}
          style={{
            width: 240,
            height: 180,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: border,
          }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      </Pressable>
      <ImageLightbox
        uri={src}
        visible={open}
        onClose={() => setOpen(false)}
        downloadName={alt.trim() || "image"}
      />
    </>
  );
}
