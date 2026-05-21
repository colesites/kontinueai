import { Text, View } from "react-native";

type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function SectionTitle({ eyebrow, title, description }: SectionTitleProps) {
  return (
    <View className="gap-1">
      {eyebrow ? (
        <Text className="text-xs font-semibold uppercase tracking-[2px] text-primary">{eyebrow}</Text>
      ) : null}
      <Text className="text-xl font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
    </View>
  );
}
