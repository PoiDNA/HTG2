import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { env } from "./env";

const SECURE_STORE_CHUNK_LIMIT = 2000;

const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const countStr = await SecureStore.getItemAsync(`${key}__count`);
    if (!countStr) {
      return SecureStore.getItemAsync(key);
    }
    const count = parseInt(countStr, 10);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= SECURE_STORE_CHUNK_LIMIT) {
      await SecureStore.deleteItemAsync(`${key}__count`);
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += SECURE_STORE_CHUNK_LIMIT) {
      chunks.push(value.slice(i, i + SECURE_STORE_CHUNK_LIMIT));
    }
    await SecureStore.deleteItemAsync(key);
    await SecureStore.setItemAsync(`${key}__count`, String(chunks.length));
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${key}__${i}`, chunk),
      ),
    );
  },
  async removeItem(key: string): Promise<void> {
    const countStr = await SecureStore.getItemAsync(`${key}__count`);
    await SecureStore.deleteItemAsync(key);
    if (countStr) {
      const count = parseInt(countStr, 10);
      await SecureStore.deleteItemAsync(`${key}__count`);
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(`${key}__${i}`),
        ),
      );
    }
  },
};

const webFallbackStorage = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      storage: Platform.OS === "web" ? webFallbackStorage : chunkedSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: {
      headers: {
        "x-htg-client": `mobile/${env.MODE}`,
      },
    },
  },
);
