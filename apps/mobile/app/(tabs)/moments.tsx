import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { t } from "../../lib/i18n";

export default function MomentsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-htg-bg" edges={["top"]}>
      <View className="px-4 pt-2 pb-3">
        <Text className="text-htg-text text-2xl font-bold">
          {t("nav.moments")}
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-htg-subtle text-center">
          Moments feed coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
