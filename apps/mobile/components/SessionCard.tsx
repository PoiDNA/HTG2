import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import type { SessionSummary } from "@htg/shared";

import { t } from "../lib/i18n";

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <Link href={`/session/${session.id}`} asChild>
      <Pressable className="bg-htg-surface rounded-lg overflow-hidden mb-3">
        {session.coverUrl ? (
          <Image
            source={{ uri: session.coverUrl }}
            style={{ width: "100%", aspectRatio: 16 / 9 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            className="bg-htg-muted w-full"
            style={{ aspectRatio: 16 / 9 }}
          />
        )}
        <View className="p-4">
          <View className="flex-row items-center mb-2">
            {session.status === "live" && (
              <View className="bg-htg-danger px-2 py-0.5 rounded mr-2">
                <Text className="text-white text-xs font-bold">
                  {t("sessions.live")}
                </Text>
              </View>
            )}
            <Text className="text-htg-subtle text-xs uppercase">
              {session.kind === "live"
                ? t("sessions.live")
                : t("sessions.recorded")}
            </Text>
            {session.durationSec && (
              <Text className="text-htg-subtle text-xs ml-auto">
                {formatDuration(session.durationSec)}
              </Text>
            )}
          </View>
          <Text
            className="text-htg-text text-base font-semibold"
            numberOfLines={2}
          >
            {session.title}
          </Text>
          {session.description && (
            <Text className="text-htg-subtle text-sm mt-1" numberOfLines={2}>
              {session.description}
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}
