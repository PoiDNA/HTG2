import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { Image } from "expo-image";
import type { SessionDetail } from "@htg/shared";

import { sessionsApi } from "../../lib/api/sessions";
import { PlayerControls } from "../../components/PlayerControls";
import { usePlayer } from "../../lib/player/use-player";
import { t } from "../../lib/i18n";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = usePlayer();

  useEffect(() => {
    if (!id) return;
    sessionsApi
      .get(id)
      .then(setSession)
      .catch((err) => setError((err as Error).message));
  }, [id]);

  useEffect(() => {
    if (session && player.ready && player.currentId !== session.id) {
      player.load({ session, autoPlay: false }).catch(() => {});
    }
  }, [session, player]);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-htg-bg items-center justify-center">
        <Text className="text-htg-danger">{error}</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 bg-htg-bg items-center justify-center">
        <ActivityIndicator color="#D4AF37" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-htg-bg" edges={["top"]}>
      <View className="flex-row items-center px-4 py-2">
        <Pressable onPress={() => router.back()} className="px-2 py-1">
          <Text className="text-htg-accent text-lg">‹</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {session.coverUrl && (
          <Image
            source={{ uri: session.coverUrl }}
            style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }}
            contentFit="cover"
          />
        )}
        <Text className="text-htg-text text-2xl font-bold mt-4">
          {session.title}
        </Text>
        {session.speakers.length > 0 && (
          <Text className="text-htg-subtle mt-1">
            {session.speakers.map((s) => s.name).join(", ")}
          </Text>
        )}
        {session.longDescription && (
          <Text className="text-htg-text mt-4 leading-6">
            {session.longDescription}
          </Text>
        )}

        {session.kind === "live" && session.liveRoomId && (
          <Link href={`/live/${session.liveRoomId}`} asChild>
            <Pressable className="bg-htg-danger py-3 rounded-md items-center mt-4">
              <Text className="text-white font-semibold">
                {t("live.join")} — {t("sessions.live")}
              </Text>
            </Pressable>
          </Link>
        )}

        <View className="mt-6">
          {!session.isEntitled ? (
            <View className="bg-htg-surface p-4 rounded-lg">
              <Text className="text-htg-subtle text-center">
                {t("errors.notEntitled")}
              </Text>
            </View>
          ) : (
            <PlayerControls
              isPlaying={player.isPlaying}
              isBuffering={player.isBuffering || player.loading}
              position={player.progress.position}
              duration={player.progress.duration || session.durationSec || 0}
              onPlay={player.play}
              onPause={player.pause}
              onSkipBack={player.skipBack}
              onSkipForward={player.skipForward}
              onSeek={player.seekTo}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
