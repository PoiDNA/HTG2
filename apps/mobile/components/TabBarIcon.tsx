import { Text } from "react-native";

const ICONS: Record<string, string> = {
  radio: "◉",
  library: "❑",
  sparkles: "✦",
  person: "☻",
};

export function TabBarIcon({
  name,
  color,
  size,
}: {
  name: string;
  color: string;
  size: number;
}) {
  return (
    <Text style={{ color, fontSize: size }} accessibilityLabel={name}>
      {ICONS[name] ?? "●"}
    </Text>
  );
}
