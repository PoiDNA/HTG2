import { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { exchangeCodeFromUrl } from "../../lib/auth/magic-link";

export default function CallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; token_hash?: string }>();
  const router = useRouter();

  useEffect(() => {
    const url = `htg://auth/callback?${new URLSearchParams(
      params as Record<string, string>,
    ).toString()}`;
    exchangeCodeFromUrl(url)
      .then(() => router.replace("/(tabs)"))
      .catch(() => router.replace("/(auth)/login"));
  }, [params, router]);

  return (
    <View className="flex-1 items-center justify-center bg-htg-bg">
      <ActivityIndicator color="#D4AF37" />
      <Text className="text-htg-subtle mt-4">Signing you in…</Text>
    </View>
  );
}
