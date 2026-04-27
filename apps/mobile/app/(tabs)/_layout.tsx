import { Tabs } from "expo-router";

import { TabBarIcon } from "../../components/TabBarIcon";
import { t } from "../../lib/i18n";
import { theme } from "../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.muted,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.subtle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.sessions"),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="radio" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("nav.library"),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="library" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="moments"
        options={{
          title: t("nav.moments"),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="sparkles" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("nav.profile"),
          tabBarIcon: ({ color, size }) => (
            <TabBarIcon name="person" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
