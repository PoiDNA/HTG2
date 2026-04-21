import "../global.css";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";

import { useAuthSession } from "../lib/auth/session";
import { exchangeCodeFromUrl } from "../lib/auth/magic-link";
import { registerPlayerService } from "../lib/player/register";

SplashScreen.preventAutoHideAsync().catch(() => {});
registerPlayerService();

function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuthSession();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (auth.status === "loading") return;
    SplashScreen.hideAsync().catch(() => {});
    const inAuthGroup = segments[0] === "(auth)";
    if (auth.status === "unauthenticated" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (auth.status === "authenticated" && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [auth.status, segments, router]);

  return <>{children}</>;
}

function DeepLinkHandler() {
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("/auth/callback")) {
        exchangeCodeFromUrl(url).catch(() => {});
      }
    });
    Linking.getInitialURL().then((url) => {
      if (url && url.includes("/auth/callback")) {
        exchangeCodeFromUrl(url).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <DeepLinkHandler />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="session/[id]"
              options={{ presentation: "card", animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="live/[roomId]"
              options={{ presentation: "fullScreenModal" }}
            />
          </Stack>
        </AuthGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
