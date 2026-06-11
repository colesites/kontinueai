import { memo } from "react";
import { useWindowDimensions } from "react-native";
import * as Linking from "expo-linking";
import MarkdownDisplay from "react-native-markdown-display";

import { useTheme } from "@/components/theme-provider";

/**
 * Themed markdown for assistant messages. Colors come from the active theme
 * (dark-first palette); react-native-markdown-display takes a plain style map,
 * so the few tokens we need are resolved here instead of via NativeWind.
 */
function MarkdownComponent({ children }: { children: string }) {
  const { isDark, primary } = useTheme();
  const { width } = useWindowDimensions();

  const foreground = isDark ? "#f5f0f3" : "#1c171a";
  const muted = isDark ? "#a99ca4" : "#6d5f67";
  const codeBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const border = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  return (
    <MarkdownDisplay
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
      style={{
        body: { color: foreground, fontSize: 15, lineHeight: 23 },
        paragraph: { marginTop: 0, marginBottom: 10 },
        heading1: { color: foreground, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 6 },
        heading2: { color: foreground, fontSize: 19, fontWeight: "700", marginTop: 12, marginBottom: 6 },
        heading3: { color: foreground, fontSize: 16.5, fontWeight: "600", marginTop: 10, marginBottom: 4 },
        heading4: { color: foreground, fontSize: 15.5, fontWeight: "600", marginTop: 8, marginBottom: 4 },
        strong: { fontWeight: "700" },
        em: { fontStyle: "italic" },
        link: { color: primary, textDecorationLine: "underline" },
        blockquote: {
          backgroundColor: codeBg,
          borderLeftColor: primary,
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
          color: foreground,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
          fontFamily: "Menlo",
          fontSize: 13,
        },
        fence: {
          backgroundColor: codeBg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
          fontFamily: "Menlo",
          fontSize: 12.5,
          color: foreground,
        },
        code_block: {
          backgroundColor: codeBg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
          fontFamily: "Menlo",
          fontSize: 12.5,
          color: foreground,
        },
        hr: { backgroundColor: border, height: 1, marginVertical: 12 },
        table: {
          borderColor: border,
          borderWidth: 1,
          borderRadius: 8,
          marginBottom: 10,
          width: width - 32 - 28,
        },
        th: { padding: 8, color: foreground, fontWeight: "600" },
        td: { padding: 8, color: foreground },
        tr: { borderColor: border, borderBottomWidth: 1 },
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}

export const Markdown = memo(MarkdownComponent);
