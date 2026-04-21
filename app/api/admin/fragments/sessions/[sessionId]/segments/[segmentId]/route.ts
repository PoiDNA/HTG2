import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditorOrTranslator } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/segments/[segmentId]
 *
 * Edycja pojedynczego segmentu transkrypcji w aktywnym imporcie.
 *
 * Body (wszystkie pola opcjonalne):
 *   - { text: string | null }                  → edycja oryginalnego PL
 *   - { text: string | null, locale: 'en'|'de'|'pt' }
 *                                              → edycja tłumaczenia w text_i18n[locale]
 *   - { speakerKey: string }                   → przepięcie segmentu do innego mówcy
 *                                                (speakerKey musi istnieć w aktywnym imporcie)
 *
 * Uprawnienia:
 *   - admin + editor: PL, tłumaczenia, reassign mówcy
 *   - translator: WYŁĄCZNIE edycja tłumaczenia w swoim przypisanym locale
 */
type Params = { params: Promise<{ sessionId: string; segmentId: string }> };

const ALLOWED_LOCALES = ['en', 'de', 'pt'] as const;
type LocaleCode = typeof ALLOWED_LOCALES[number];

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditorOrTranslator();
  if ('error' in auth) return auth.error;

  const { sessionId, segmentId } = await params;

  let body: { text?: string | null; speakerKey?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hasText = 'text' in body;
  const hasSpeakerKey = typeof body.speakerKey === 'string' && body.speakerKey.length > 0;

  let locale: LocaleCode | null = null;
  if (body.locale !== undefined && body.locale !== null && body.locale !== '') {
    if (!ALLOWED_LOCALES.includes(body.locale as LocaleCode)) {
      return NextResponse.json(
        { error: `locale must be one of: pl (default), ${ALLOWED_LOCALES.join(', ')}` },
        { status: 400 },
      );
    }
    locale = body.locale as LocaleCode;
  }

  if (!hasText && !hasSpeakerKey) {
    return NextResponse.json(
      { error: 'Brak pól do aktualizacji (text lub speakerKey)' },
      { status: 400 },
    );
  }

  if (auth.role === 'translator') {
    if (hasSpeakerKey) {
      return NextResponse.json(
        { error: 'Tłumacz nie może zmieniać przypisania mówcy.' },
        { status: 403 },
      );
    }
    if (locale === null) {
      return NextResponse.json(
        { error: 'Tłumacz nie może edytować oryginału PL — wymagany parametr `locale`.' },
        { status: 403 },
      );
    }
    if (auth.translatorLocale !== locale) {
      return NextResponse.json(
        { error: `Tłumacz może edytować wyłącznie locale=${auth.translatorLocale}.` },
        { status: 403 },
      );
    }
  }

  const raw = body.text;
  const nextText: string | null =
    typeof raw === 'string' ? (raw.trim() === '' ? null : raw) : null;
  if (hasText && nextText !== null && nextText.length > 8000) {
    return NextResponse.json({ error: 'Tekst za długi (max 8000)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  const { data: seg, error: segErr } = await db
    .from('session_speaker_segments')
    .select('id, session_template_id, import_id, text_i18n')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });
  if (!seg || seg.session_template_id !== sessionId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if (hasText) {
    if (locale === null) {
      patch.text = nextText;
    } else {
      const current = (seg.text_i18n as Record<string, string> | null) ?? {};
      const nextI18n: Record<string, string> = { ...current };
      if (nextText === null) delete nextI18n[locale];
      else nextI18n[locale] = nextText;
      patch.text_i18n = nextI18n;
    }
  }

  if (hasSpeakerKey) {
    const newKey = body.speakerKey as string;
    const { data: exists, error: existsErr } = await db
      .from('session_speaker_segments')
      .select('id')
      .eq('import_id', seg.import_id)
      .eq('speaker_key', newKey)
      .limit(1)
      .maybeSingle();
    if (existsErr) return NextResponse.json({ error: existsErr.message }, { status: 500 });
    if (!exists) {
      return NextResponse.json(
        { error: 'Nieznany speakerKey w tym imporcie' },
        { status: 400 },
      );
    }
    patch.speaker_key = newKey;
  }

  const { error: updErr } = await db
    .from('session_speaker_segments')
    .update(patch)
    .eq('id', segmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    text: hasText ? nextText : undefined,
    speakerKey: hasSpeakerKey ? body.speakerKey : undefined,
    locale: hasText ? (locale ?? 'pl') : undefined,
  });
}
