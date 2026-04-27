import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SessionSummary } from "@htg/shared";

import { sessionsApi } from "../../lib/api/sessions";
import { SessionCard } from "../../components/SessionCard";
import { t, getLocale } from "../../lib/i18n";

export default function LibraryScreen() {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await sessionsApi.list({ locale: getLocale() });
      setItems(data.items.filter((s) => s.kind === "recorded"));
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
          {t("nav.library")}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#D4AF37" className="mt-12" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionCard session={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#D4AF37"
            />
          }
          ListEmptyComponent={
            <Text className="text-htg-subtle text-center py-16">
              {t("sessions.empty")}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
