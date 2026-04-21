import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * Tłumaczenia Momentów (session_fragments) + segmentów transkrypcji
 * (session_speaker_segments) dla jednej sesji (session_template) → EN/DE/PT.
 *
 * Oryginałem (source of truth) jest zawsze PL:
 *   - fragment.title / fragment.description (opisu nie trzymamy — stąd
 *     bazą dla tłumaczenia description jest null i ten kawałek pomijamy)
 *   - segment.text
 *
 * Tłumaczenia trafiają do:
 *   - session_fragments.title_i18n[locale]
 *   - session_fragments.description_i18n[locale]  (na razie puste — brak PL)
 *   - session_speaker_segments.text_i18n[locale]  (migracja 098)
 *
 * Model: konfigurowalny przez env var ANTHROPIC_MODEL (fallback: claude-sonnet-4-6).
 * Jakościowy tryb dla długich transkrypcji sesji medytacyjnych.
 */

export const TRANSLATE_TARGETS = ['en', 'de', 'pt'] as const;
export type TranslateTarget = typeof TRANSLATE_TARGETS[number];
export type TranslateScope = 'fragments' | 'segments' | 'all';

const LOCALE_NAMES: Record<TranslateTarget, string> = {
  en: 'English',
  de: 'German',
  pt: 'European Portuguese (PT-PT, NOT Brazilian Portuguese)',
};

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const BATCH_SIZE = 20;

// ─── Low-level Claude call ─────────────────────────────────────────────

/**
 * Tłumaczy batch tekstów przy pomocy Claude API. Zachowuje numerację [N]
 * w odpowiedzi. Fallback: jeśli brak klucza API albo tekst nie wrócił,
 * zwraca oryginał (żeby nie zepsuć UI).
 */
async function translateBatch(
  texts: string[],
  locale: TranslateTarget,
  kind: 'fragment-titles' | 'segment-texts',
): Promise<string[]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[translate-fragments-segments] ANTHROPIC_API_KEY not set');
    return texts;
  }

  const numbered = texts.map((t, i) => `[${i}] ${t.replace(/\n+/g, ' ').trim()}`).join('\n');

  const systemPrompt = kind === 'fragment-titles'
    ? `You are a careful translator for HTG (Harmonia Twojego Głosu), a Polish
contemplative/spiritual audio platform. You translate short fragment titles
(chapter labels, 2–8 words) from Polish to ${LOCALE_NAMES[locale]}.

Rules:
- Output the SAME numbered format [N], one entry per line.
- Keep proper nouns and brand names (HTG, Harmonia, Głos) as-is.
- Use contemplative, warm, natural wording — NOT literal.
- For Portuguese: European Portuguese only (PT-PT).`
    : `You are a careful translator for HTG (Harmonia Twojego Głosu), a Polish
contemplative/spiritual audio platform. You translate transcription segments
(what a speaker said during a meditation/coaching session) from Polish to
${LOCALE_NAMES[locale]}.

Rules:
- Output the SAME numbered format [N], one entry per line. No blank lines
  between entries. Multi-line content must be flattened to a single line.
- Preserve the intent and tone (warm, reflective, spoken).
- Keep proper nouns and brand names as-is.
- For Portuguese: European Portuguese only (PT-PT).
- If a segment is empty or just noise, output the original text unchanged.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Translate to ${LOCALE_NAMES[locale]}:\n\n${numbered}\n\nOutput (same numbered format):`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
  const lines = text.split('\n').filter((l: string) => l.trim());

  const result: string[] = new Array(texts.length).fill('');
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s+([\s\S]*)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx >= 0 && idx < texts.length) {
        result[idx] = match[2].trim();
      }
    }
  }

  // Fallback: zachowaj oryginał gdy tłumaczenie puste
  for (let i = 0; i < result.length; i++) {
    if (!result[i]) result[i] = texts[i];
  }

  return result;
}

async function translateInChunks(
  texts: string[],
  locale: TranslateTarget,
  kind: 'fragment-titles' | 'segment-texts',
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length <= BATCH_SIZE) {
    return translateBatch(texts, locale, kind);
  }

  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    chunks.push(texts.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(chunks.map((c) => translateBatch(c, locale, kind)));
  return results.flat();
}

// ─── Public API ────────────────────────────────────────────────────────

export interface TranslateSessionArgs {
  sessionId: string;
  targets?: TranslateTarget[];
  scope?: TranslateScope;
}

export interface TranslateSessionResult {
  translated: { fragments: number; segments: number };
  targets: TranslateTarget[];
  scope: TranslateScope;
  elapsedMs: number;
}

/**
 * Tłumaczy wszystkie Momenty i segmenty aktywnego importu danej sesji
 * na wskazane locale. Nadpisuje istniejące wartości per (record, locale).
 */
export async function translateSessionFragmentsAndSegments(
  args: TranslateSessionArgs,
): Promise<TranslateSessionResult> {
  const sessionId = args.sessionId;
  const targets = args.targets && args.targets.length > 0
    ? args.targets
    : [...TRANSLATE_TARGETS];
  const scope: TranslateScope = args.scope ?? 'all';

  const db = createSupabaseServiceRole();
  const t0 = Date.now();

  let translatedFragments = 0;
  let translatedSegments = 0;

  // ── Fragments ────────────────────────────────────────────────────────
  if (scope === 'fragments' || scope === 'all') {
    const { data: fragRows, error: fragErr } = await db
      .from('session_fragments')
      .select('id, title, title_i18n, description_i18n')
      .eq('session_template_id', sessionId)
      .order('ordinal', { ascending: true });

    if (fragErr) {
      throw new Error(`Nie można pobrać Momentów: ${fragErr.message}`);
    }

    const fragments = (fragRows ?? []).filter(
      (f) => typeof f.title === 'string' && f.title.trim() !== '',
    );

    if (fragments.length > 0) {
      const titles = fragments.map((f) => f.title as string);

      const perLocaleTitles: Partial<Record<TranslateTarget, string[]>> = {};
      await Promise.all(
        targets.map(async (loc) => {
          perLocaleTitles[loc] = await translateInChunks(titles, loc, 'fragment-titles');
        }),
      );

      for (let i = 0; i < fragments.length; i++) {
        const f = fragments[i];
        const newTitleI18n: Record<string, string> = { ...((f.title_i18n as Record<string, string>) ?? {}) };
        for (const loc of targets) {
          const arr = perLocaleTitles[loc];
          if (arr && arr[i]) newTitleI18n[loc] = arr[i];
        }

        const { error: updErr } = await db
          .from('session_fragments')
          .update({
            title_i18n: newTitleI18n,
            updated_at: new Date().toISOString(),
          })
          .eq('id', f.id as string);

        if (updErr) {
          console.error('[translate] update fragment failed', f.id, updErr);
          continue;
        }
        translatedFragments += 1;
      }
    }
  }

  // ── Segments (aktywny import) ────────────────────────────────────────
  if (scope === 'segments' || scope === 'all') {
    const { data: imp, error: impErr } = await db
      .from('session_speaker_imports')
      .select('id')
      .eq('session_template_id', sessionId)
      .eq('is_active', true)
      .maybeSingle();

    if (impErr) {
      throw new Error(`Nie można pobrać aktywnego importu: ${impErr.message}`);
    }

    if (imp) {
      const { data: segRows, error: segErr } = await db
        .from('session_speaker_segments')
        .select('id, text, text_i18n')
        .eq('import_id', imp.id)
        .not('text', 'is', null)
        .order('start_sec', { ascending: true });

      if (segErr) {
        throw new Error(`Nie można pobrać segmentów: ${segErr.message}`);
      }

      const segments = (segRows ?? []).filter(
        (s) => typeof s.text === 'string' && (s.text as string).trim() !== '',
      );

      if (segments.length > 0) {
        const texts = segments.map((s) => s.text as string);

        const perLocale: Partial<Record<TranslateTarget, string[]>> = {};
        await Promise.all(
          targets.map(async (loc) => {
            perLocale[loc] = await translateInChunks(texts, loc, 'segment-texts');
          }),
        );

        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          const newTextI18n: Record<string, string> = { ...((s.text_i18n as Record<string, string>) ?? {}) };
          for (const loc of targets) {
            const arr = perLocale[loc];
            if (arr && arr[i]) newTextI18n[loc] = arr[i];
          }

          const { error: updErr } = await db
            .from('session_speaker_segments')
            .update({ text_i18n: newTextI18n })
            .eq('id', s.id as string);

          if (updErr) {
            console.error('[translate] update segment failed', s.id, updErr);
            continue;
          }
          translatedSegments += 1;
        }
      }
    }
  }

  return {
    translated: { fragments: translatedFragments, segments: translatedSegments },
    targets,
    scope,
    elapsedMs: Date.now() - t0,
  };
}
