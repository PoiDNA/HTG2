import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "../supabase";

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URL = Linking.createURL("/auth/callback");

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL,
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

export async function exchangeCodeFromUrl(url: string): Promise<void> {
  const parsed = Linking.parse(url);
  const code =
    (parsed.queryParams?.code as string | undefined) ??
    (parsed.queryParams?.token_hash as string | undefined);
  if (!code) {
    throw new Error("Missing auth code in callback URL");
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export { REDIRECT_URL };
