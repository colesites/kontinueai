import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Download, X } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { showAppErrorToast } from "@/lib/app-errors";
import { shareMediaFile } from "@/lib/media-share";

/**
 * Full-screen image viewer, the native ImageLightbox from web: dark scrim,
 * pinch-to-zoom (iOS), close and save controls. Saving goes through the share
 * sheet, which carries "Save Image" on iOS and every gallery app on Android.
 */
export function ImageLightbox({
  uri,
  visible,
  onClose,
  downloadName = "kontinue-image",
  caption,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
  downloadName?: string;
  caption?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!uri || saving) return;
    setSaving(true);
    try {
      await shareMediaFile(uri, { filename: downloadName, fallbackExt: "png" });
    } catch (error) {
      showAppErrorToast(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible && !!uri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/95">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
          maximumZoomScale={Platform.OS === "ios" ? 4 : 1}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={onClose} accessibilityLabel="Close image">
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width, height: height * 0.78 }}
                contentFit="contain"
                transition={120}
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </Pressable>
        </ScrollView>

        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 flex-row items-center justify-between px-4"
          style={{ top: insets.top + 8 }}
        >
          <LightboxButton label="Close" icon={X} onPress={onClose} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save image"
            onPress={() => void handleSave()}
            className="h-10 flex-row items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 active:bg-white/20"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Icon as={Download} size={16} color="#ffffff" />
            )}
            <Text className="text-[13px] font-semibold text-white">Save</Text>
          </Pressable>
        </View>

        {caption ? (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 px-6"
            style={{ bottom: insets.bottom + 20 }}
          >
            <Text
              numberOfLines={3}
              className="text-center text-[13px] leading-5 text-white/75"
            >
              {caption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function LightboxButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: typeof X;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 active:bg-white/20"
    >
      <Icon as={icon} size={18} color="#ffffff" />
    </Pressable>
  );
}
