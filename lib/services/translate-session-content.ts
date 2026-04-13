import { createSupabaseServiceRole } from '@/lib/supabase/service';

const TARGET_LOCALES = ['en', 'de', 'pt'] as const;
type TargetLocale = typeof TARGET_LOCALES[number];

const LOCALE_NAMES: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
  de: 'German',
  pt: 'European Portuguese (PT-PT)',
};

// ─── Claude API call ──────────────────────────────────────────

async function translateTexts(
  texts: string[],
  targetLocale: TargetLocale
): Promise<string[]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return texts;
  }

  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Translate the following session titles and descriptions from Polish to ${LOCALE_NAMES[targetLocale]}.

Rules:
- Keep numbered format [N]
- These are titles/descriptions for audio meditation and spiritual development sessions
- Use appropriate spiritual, contemplative language
- For Portuguese, use European Portuguese (PT-PT), not Brazilian
- Keep proper nouns and unique session names (like "HTG") as-is
- Be concise and clear

Input:
${numbered}

Output (same numbered format, translated):`,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
  const lines = text.split('\n').filter((l: string) => l.trim());
  const result: string[] = new Array(texts.length).fill('');

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s+([\s\S]*)/);
    if (match) {
      const idx = parseInt(match[1]);
      if (idx >= 0 && idx < texts.length) {
        result[idx] = match[2].trim();
      }
    }
  }

  // Fallback: keep original if translation is empty
  for (let i = 0; i < result.length; i++) {
    if (!result[i]) result[i] = texts[i];
  }

  return result;
}

// ─── Translate one record ─────────────────────────────────────

interface TranslateResult {
  id: string;
  localesTranslated: string[];
  error?: string;
}

async function translateRecord(
  table: 'session_templates' | 'monthly_sets',
  id: string,
  title: string,
  description: string | null,
  titleI18n: Record<string, string> | null,
  descriptionI18n: Record<string, string> | null,
  onlyMissing = true
): Promise<TranslateResult> {
  const db = createSupabaseServiceRole();
  const localesTranslated: string[] = [];

  const locales = onlyMissing
    ? TARGET_LOCALES.filter(l => !titleI18n?.[l])
    : [...TARGET_LOCALES];

  if (locales.length === 0) return { id, localesTranslated };

  const newTitleI18n = { ...(titleI18n ?? {}) };
  const newDescI18n = { ...(descriptionI18n ?? {}) };

  for (const locale of locales) {
    try {
      const texts = description ? [title, description] : [title];
      const translated = await translateTexts(texts, locale);

      newTitleI18n[locale] = translated[0];
      if (description && translated[1]) {
        newDescI18n[locale] = translated[1];
      }
      localesTranslated.push(locale);
    } catch (err) {
      console.error(`Translation failed for ${table}/${id} → ${locale}:`, err);
    }
  }

  if (localesTranslated.length > 0) {
    await db.from(table).update({
      title_i18n: newTitleI18n,
      ...(description ? { description_i18n: newDescI18n } : {}),
    }).eq('id', id);
  }

  return { id, localesTranslated };
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Translate a single session or monthly set to all missing locales.
 * If forceAll=true, re-translates even if already translated.
 */
export async function translateSessionById(
  table: 'session_templates' | 'monthly_sets',
  id: string,
  forceAll = false
): Promise<TranslateResult> {
  const db = createSupabaseServiceRole();
  const { data } = await db
    .from(table)
    .select('id, title, description, title_i18n, description_i18n')
    .eq('id', id)
    .single();

  if (!data?.title) return { id, localesTranslated: [], error: 'Not found' };

  return translateRecord(table, id, data.title, data.description, data.title_i18n, data.description_i18n, !forceAll);
}

/**
 * Batch: translate all sessions and monthly sets that have missing locale translations.
 * Only processes records with a Polish title (the base column is always Polish).
 * Returns how many records were processed.
 */
export async function translateAllMissing(): Promise<{ sessions: number; sets: number }> {
  const db = createSupabaseServiceRole();

  // Find sessions missing at least one locale translation
  const { data: sessions } = await db
    .from('session_templates')
    .select('id, title, description, title_i18n, description_i18n')
    .eq('is_published', true)
    .not('title', 'is', null);

  const missingSessions = (sessions ?? []).filter(s =>
    TARGET_LOCALES.some(l => !s.title_i18n?.[l])
  );

  for (const s of missingSessions) {
    await translateRecord('session_templates', s.id, s.title, s.description, s.title_i18n, s.description_i18n, true);
  }

  // Find monthly sets missing translations
  const { data: sets } = await db
    .from('monthly_sets')
    .select('id, title, description, title_i18n, description_i18n')
    .eq('is_published', true)
    .not('title', 'is', null);

  const missingSets = (sets ?? []).filter(s =>
    TARGET_LOCALES.some(l => !s.title_i18n?.[l])
  );

  for (const s of missingSets) {
    await translateRecord('monthly_sets', s.id, s.title, s.description, s.title_i18n, s.description_i18n, true);
  }

  return { sessions: missingSessions.length, sets: missingSets.length };
}
