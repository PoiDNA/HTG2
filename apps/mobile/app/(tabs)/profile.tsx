import { View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signOut, useAuthSession } from "../../lib/auth/session";
import { t } from "../../lib/i18n";

export default function ProfileScreen() {
  const auth = useAuthSession();
  const email =
    auth.status === "authenticated" ? auth.session.user.email : null;

  const handleSignOut = () => {
    Alert.alert(t("auth.logout"), "", [
      { text: "Cancel", style: "cancel" },
      { text: t("auth.logout"), style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-htg-bg" edges={["top"]}>
      <View className="px-4 pt-2 pb-3">
        <Text className="text-htg-text text-2xl font-bold">
          {t("nav.profile")}
        </Text>
      </View>
      <View className="px-4 flex-1">
        {email && (
          <View className="bg-htg-surface rounded-lg p-4 mb-4">
            <Text className="text-htg-subtle text-xs mb-1">Email</Text>
            <Text className="text-htg-text">{email}</Text>
          </View>
        )}
        <View className="bg-htg-surface rounded-lg p-4 mb-4">
          <Text className="text-htg-subtle text-xs mb-1">Subscription</Text>
          <Text className="text-htg-text">
            Manage your subscription at htgcyou.com
          </Text>
        </View>
        <Pressable
          onPress={handleSignOut}
          className="bg-htg-muted py-3 rounded-md items-center mt-auto mb-8"
        >
          <Text className="text-htg-text font-semibold">{t("auth.logout")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
