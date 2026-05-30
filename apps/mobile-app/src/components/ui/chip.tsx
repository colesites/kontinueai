import { Pressable, Text, View } from "react-native";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  dotColor?: string;
  small?: boolean;
};

export function Chip({ label, selected, onPress, dotColor, small }: ChipProps) {
  const containerClass = small ? "px-2.5 py-1" : "px-3 py-1.5";

  return (
    <Pressable
      className={`flex-row items-center gap-2 rounded-full border ${containerClass} ${
        selected
          ? "border-primary bg-primary/15"
          : "border-border bg-secondary"
      }`}
      onPress={onPress}
      disabled={!onPress}
    >
      {dotColor ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} /> : null}
      <Text className={`text-xs font-medium ${selected ? "text-primary" : "text-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
