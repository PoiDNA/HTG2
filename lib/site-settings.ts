import type { createSupabaseServiceRole } from '@/lib/supabase/service';

type DB = ReturnType<typeof createSupabaseServiceRole>;

/**
 * Read a string value from site_settings, normalizing the JSONB wrapping.
 *
 * site_settings.value is JSONB, so a plain string is stored as `"foo"`
 * (JSON string with quotes), not `foo`. Calling `.value as string` returns
 * `"foo"` — with literal quotes — which then breaks equality comparisons.
 * This helper strips the JSON wrapper via the Supabase driver's JSON decoding
 * and always returns a plain string.
 *
 * If the key is missing or the value is not a JSON string, returns the
 * provided fallback (default: empty string).
 */
export async function readSiteSettingString(
  db: DB,
  key: string,
  fallback = '',
): Promise<string> {
  const { data, error } = await db
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;
  const raw = data.value;
  if (typeof raw === 'string') return raw;
  // JSONB may decode to a number/boolean/object — coerce defensively.
  return raw == null ? fallback : String(raw);
}
