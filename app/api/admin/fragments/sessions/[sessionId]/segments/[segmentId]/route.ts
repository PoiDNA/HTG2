import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditorOrTranslator } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/segments/[segmentId]
 *
 * Edycja tekstu pojedynczego segmentu transkrypcji w aktywnym imporcie.
 *
 * Body:
 *   - { text: string | null }                    → edycja oryginalnego PL
 *   - { text: string | null, locale: 'en'|'de'|'pt' }
 *                                                → edycja/ustawienie tłumaczenia
 *                                                  w text_i18n[locale]
 *
 * Uprawnienia:
 *   - admin + editor: mogą edytować zarówno PL (oryginał) jak i dowolny locale
 *   - translator: MOŻE edytować WYŁĄCZNIE swój przypisany locale; próba
 *     edycji PL (brak locale) albo innego niż przypisany locale → 403
 */
type Params = { params: Promise<{ sessionId: string; segmentId: string }> };

const ALLOWED_LOCALES = ['en', 'de', 'pt'] as const;
type LocaleCode = typeof ALLOWED_LOCALES[number];

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditorOrTranslator();
  if ('error' in auth) return auth.error;

  const { sessionId, segmentId } = await params;

  let body: { text?: string | null; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.text;
  const nextText: string | null =
    typeof raw === 'string' ? (raw.trim() === '' ? null : raw) : null;
  if (nextText !== null && nextText.length > 8000) {
    return NextResponse.json({ error: 'Tekst za długi (max 8000)' }, { status: 400 });
  }

  // Walidacja locale
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

  // Guard dla Tłumacza: tylko swój locale.
  if (auth.role === 'translator') {
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

  const db = createSupabaseServiceRole();

  // Weryfikujemy, że segment należy do tej sesji (defense-in-depth).
  const { data: seg, error: segErr } = await db
    .from('session_speaker_segments')
    .select('id, session_template_id, text_i18n')
    .eq('id', segmentId)
    .maybeSingle();
  if (segErr) return NextResponse.json({ error: segErr.message }, { status: 500 });
  if (!seg || seg.session_template_id !== sessionId) {
    return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
  }

  if (locale === null) {
    // Edycja oryginału PL
    const { error: updErr } = await db
      .from('session_speaker_segments')
      .update({ text: nextText })
      .eq('id', segmentId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, text: nextText, locale: 'pl' });
  }

  // Edycja tłumaczenia w text_i18n
  const current = (seg.text_i18n as Record<string, string> | null) ?? {};
  const nextI18n: Record<string, string> = { ...current };
  if (nextText === null) {
    delete nextI18n[locale];
  } else {
    nextI18n[locale] = nextText;
  }

  const { error: updErr } = await db
    .from('session_speaker_segments')
    .update({ text_i18n: nextI18n })
    .eq('id', segmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, text: nextText, locale });
}
