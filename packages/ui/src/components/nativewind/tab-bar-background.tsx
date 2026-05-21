import { StyleSheet, View } from "react-native";

export function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View className="flex-1 rounded-[22px] border border-border bg-card/95" />
    </View>
  );
}
