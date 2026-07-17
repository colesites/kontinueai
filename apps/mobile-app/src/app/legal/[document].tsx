import { useMemo } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";

import { ScreenHeader } from "@/components/screen-header";

const LEGAL_DOCUMENTS = {
  privacy: {
    title: "Privacy policy",
    url: "https://kontinueai.com/legal/privacy-policy",
  },
  terms: {
    title: "Terms of service",
    url: "https://kontinueai.com/legal/terms-of-service",
  },
} as const;

export default function LegalDocumentScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const page = useMemo(
    () =>
      LEGAL_DOCUMENTS[document as keyof typeof LEGAL_DOCUMENTS] ??
      LEGAL_DOCUMENTS.privacy,
    [document],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScreenHeader title={page.title} leading="back" />
      <View className="flex-1 border-t border-border">
        <WebView
          source={{ uri: page.url }}
          originWhitelist={["https://kontinueai.com"]}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
}
