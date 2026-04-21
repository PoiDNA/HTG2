import { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { useLiveRoom, isSpeaking } from "../../lib/livekit/room";
import { t } from "../../lib/i18n";

export default function LiveRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const room = useLiveRoom(roomId ?? "");

  useEffect(() => {
    activateKeepAwakeAsync("live-room").catch(() => {});
    return () => {
      deactivateKeepAwake("live-room");
    };
  }, []);

  useEffect(() => {
    if (room.status.kind === "error") {
      Alert.alert(t("errors.generic"), room.status.message, [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [room.status, router]);

  const statusLabel =
    room.status.kind === "connecting"
      ? t("live.connecting")
      : room.status.kind === "reconnecting"
        ? t("live.reconnecting")
        : room.status.kind === "connected"
          ? t("live.connected")
          : "";

  return (
    <SafeAreaView className="flex-1 bg-htg-bg">
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-htg-muted">
        <Text className="text-htg-text text-lg font-semibold">
          {t("sessions.live")}
        </Text>
        <View className="flex-row items-center">
          {room.status.kind !== "connected" && (
            <ActivityIndicator color="#D4AF37" className="mr-2" />
          )}
          <Text className="text-htg-subtle text-sm">{statusLabel}</Text>
        </View>
      </View>

      <FlatList
        data={room.participants}
        keyExtractor={(p) => p.identity}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View
            className={`flex-row items-center p-3 rounded-lg mb-2 ${
              isSpeaking(item) ? "bg-htg-accent/20" : "bg-htg-surface"
            }`}
          >
            <View className="w-10 h-10 rounded-full bg-htg-muted items-center justify-center mr-3">
              <Text className="text-htg-text">
                {(item.name ?? item.identity).slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-htg-text font-medium">
                {item.name ?? item.identity}
              </Text>
              <Text className="text-htg-subtle text-xs">
                {item.isLocal ? "You" : "Participant"}
              </Text>
            </View>
            {isSpeaking(item) && (
              <Text className="text-htg-accent">●</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text className="text-htg-subtle text-center py-8">
            {t("live.connecting")}
          </Text>
        }
      />

      <View className="flex-row items-center justify-between px-6 py-4 border-t border-htg-muted">
        <Pressable
          onPress={room.toggleMute}
          className={`w-16 h-16 rounded-full items-center justify-center ${
            room.muted ? "bg-htg-danger" : "bg-htg-surface"
          }`}
          accessibilityLabel="Toggle mute"
        >
          <Text className="text-htg-text text-xl">
            {room.muted ? "🔇" : "🎙"}
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await room.leave();
            router.back();
          }}
          className="bg-htg-danger px-6 py-4 rounded-full"
        >
          <Text className="text-white font-semibold">{t("live.leave")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
