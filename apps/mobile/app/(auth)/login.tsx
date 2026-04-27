import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { sendMagicLink } from "../../lib/auth/magic-link";
import { isAppleSignInAvailable, signInWithApple } from "../../lib/auth/apple";
import { t } from "../../lib/i18n";
import { useEffect } from "react";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const handleMagicLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      Alert.alert(t("errors.generic"), t("auth.login.email"));
      return;
    }
    setSubmitting(true);
    try {
      await sendMagicLink(trimmed);
      setSent(true);
    } catch (err) {
      Alert.alert(t("errors.generic"), (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApple = async () => {
    setSubmitting(true);
    try {
      await signInWithApple();
    } catch (err) {
      Alert.alert(t("errors.generic"), (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-htg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 justify-center px-6">
          <Text className="text-htg-text text-4xl font-bold mb-2">
            {t("app.name")}
          </Text>
          <Text className="text-htg-subtle text-lg mb-8">
            {t("auth.login.title")}
          </Text>

          <Text className="text-htg-subtle text-sm mb-2">
            {t("auth.login.email")}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!submitting}
            placeholder="you@example.com"
            placeholderTextColor="#6b7280"
            className="bg-htg-surface text-htg-text px-4 py-3 rounded-md mb-4"
          />

          <Pressable
            onPress={handleMagicLink}
            disabled={submitting}
            className="bg-htg-accent py-3 rounded-md items-center mb-3"
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text className="text-black font-semibold">
                {t("auth.login.sendMagicLink")}
              </Text>
            )}
          </Pressable>

          {sent && (
            <Text className="text-htg-subtle text-sm text-center mb-4">
              {t("auth.login.magicLinkSent")}
            </Text>
          )}

          {appleAvailable && (
            <Pressable
              onPress={handleApple}
              disabled={submitting}
              className="bg-htg-text py-3 rounded-md items-center"
            >
              <Text className="text-black font-semibold">
                {t("auth.login.signInWithApple")}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
