import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SessionSummary } from "@htg/shared";

import { sessionsApi } from "../../lib/api/sessions";
import { SessionCard } from "../../components/SessionCard";
import { t, getLocale } from "../../lib/i18n";

export default function SessionsScreen() {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await sessionsApi.list({ locale: getLocale() });
      setItems(data.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView className="flex-1 bg-htg-bg" edges={["top"]}>
      <View className="px-4 pt-2 pb-3">
        <Text className="text-htg-text text-2xl font-bold">
          {t("nav.sessions")}
        </Text>
      </View>
      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionCard session={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor="#D4AF37"
            />
          }
          ListEmptyComponent={
            <View className="items-center py-16">
              <Text className="text-htg-subtle">
                {error ?? t("sessions.empty")}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
