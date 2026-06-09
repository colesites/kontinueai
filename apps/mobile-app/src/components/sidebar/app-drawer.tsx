import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SidebarContent } from "./sidebar-content";
import { useSidebar } from "./sidebar-context";

/** Slide-over navigation drawer (left). Dimmed backdrop closes it. */
export function AppDrawer() {
  const { open, closeSidebar } = useSidebar();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closeSidebar}
    >
      <View className="flex-row" style={{ flex: 1 }}>
        {/* Panel */}
        <View className="w-[86%] max-w-[340px] border-r border-border bg-background">
          <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left"]}>
            <SidebarContent onNavigate={closeSidebar} />
          </SafeAreaView>
        </View>

        {/* Backdrop */}
        <Pressable
          accessibilityLabel="Close sidebar"
          onPress={closeSidebar}
          className="bg-black/50"
          style={{ flex: 1 }}
        />
      </View>
    </Modal>
  );
}
