import { View, Text, Pressable, ActivityIndicator } from "react-native";

import { t } from "../lib/i18n";

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onSeek: (sec: number) => void;
};

export function PlayerControls({
  isPlaying,
  isBuffering,
  position,
  duration,
  onPlay,
  onPause,
  onSkipBack,
  onSkipForward,
  onSeek,
}: Props) {
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View className="bg-htg-surface rounded-lg p-4">
      <View className="h-1 bg-htg-muted rounded-full mb-2">
        <View
          className="h-1 bg-htg-accent rounded-full"
          style={{ width: `${pct * 100}%` }}
        />
      </View>
      <View className="flex-row justify-between mb-4">
        <Text className="text-htg-subtle text-xs">{formatTime(position)}</Text>
        <Text className="text-htg-subtle text-xs">{formatTime(duration)}</Text>
      </View>
      <View className="flex-row items-center justify-center">
        <Pressable
          onPress={onSkipBack}
          className="px-4 py-2"
          accessibilityLabel={t("player.skipBack")}
        >
          <Text className="text-htg-text text-lg">−15s</Text>
        </Pressable>
        <Pressable
          onPress={isPlaying ? onPause : onPlay}
          className="bg-htg-accent w-16 h-16 rounded-full items-center justify-center mx-6"
          accessibilityLabel={isPlaying ? t("player.pause") : t("player.play")}
        >
          {isBuffering ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text className="text-black text-2xl">
              {isPlaying ? "❚❚" : "▶"}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={onSkipForward}
          className="px-4 py-2"
          accessibilityLabel={t("player.skipForward")}
        >
          <Text className="text-htg-text text-lg">+15s</Text>
        </Pressable>
      </View>
      {onSeek ? null : null /* onSeek wired by parent when slider added */}
    </View>
  );
}
