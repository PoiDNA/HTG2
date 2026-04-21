const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(
      `Missing env var ${name}. Check apps/mobile/.env and app.config.ts.`,
    );
  }
  return value;
};

export const env = {
  SUPABASE_URL: required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  SUPABASE_ANON_KEY: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  API_BASE_URL: required(
    "EXPO_PUBLIC_API_BASE_URL",
    process.env.EXPO_PUBLIC_API_BASE_URL,
  ),
  LIVEKIT_WS_URL: required(
    "EXPO_PUBLIC_LIVEKIT_WS_URL",
    process.env.EXPO_PUBLIC_LIVEKIT_WS_URL,
  ),
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  MODE: process.env.EXPO_PUBLIC_ENV ?? "development",
} as const;
