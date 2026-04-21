import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrEditorOrTranslator } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/fragments/sessions/[sessionId]/fragments/[fragmentId]/i18n
 *
 * Zapis tłumaczeń pojedynczego Momentu per locale (en|de|pt) BEZ dotykania
 * oryginału PL (kolumna `title` / `description`). Używane przez panel edytora
 * Momentów w trybie EN/DE/PT oraz przez Tłumaczy.
 *
 * Body:
 *   {
 *     locale: 'en'|'de'|'pt',
 *     title?: string | null,       // merge do title_i18n[locale]
 *     description?: string | null, // merge do description_i18n[locale]
 *   }
 *
 * Uprawnienia:
 *   - admin + editor: dowolny locale
 *   - translator: tylko swój przypisany locale (TRANSLATOR_LOCALE[email])
 */

type Params = { params: Promise<{ sessionId: string; fragmentId: string }> };

const ALLOWED_LOCALES = ['en', 'de', 'pt'] as const;
type LocaleCode = typeof ALLOWED_LOCALES[number];

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditorOrTranslator();
  if ('error' in auth) return auth.error;

  const { sessionId, fragmentId } = await params;

  let body: { locale?: string; title?: string | null; description?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.locale || !ALLOWED_LOCALES.includes(body.locale as LocaleCode)) {
    return NextResponse.json(
      { error: `locale required, one of: ${ALLOWED_LOCALES.join(', ')}` },
      { status: 400 },
    );
  }
  const locale = body.locale as LocaleCode;

  if (auth.role === 'translator' && auth.translatorLocale !== locale) {
    return NextResponse.json(
      { error: `Tłumacz może edytować wyłącznie locale=${auth.translatorLocale}.` },
      { status: 403 },
    );
  }

  if (body.title !== undefined && body.title !== null && typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title must be string or null' }, { status: 400 });
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    return NextResponse.json({ error: 'description must be string or null' }, { status: 400 });
  }
  if (typeof body.title === 'string' && body.title.length > 500) {
    return NextResponse.json({ error: 'Tytuł za długi (max 500)' }, { status: 400 });
  }
  if (typeof body.description === 'string' && body.description.length > 4000) {
    return NextResponse.json({ error: 'Opis za długi (max 4000)' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  const { data: frag, error: fragErr } = await db
    .from('session_fragments')
    .select('id, session_template_id, title_i18n, description_i18n')
    .eq('id', fragmentId)
    .maybeSingle();
  if (fragErr) return NextResponse.json({ error: fragErr.message }, { status: 500 });
  if (!frag || frag.session_template_id !== sessionId) {
    return NextResponse.json({ error: 'Fragment not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title !== undefined) {
    const next = { ...((frag.title_i18n as Record<string, string> | null) ?? {}) };
    const val = typeof body.title === 'string' ? body.title.trim() : '';
    if (val === '' || body.title === null) delete next[locale];
    else next[locale] = val;
    update.title_i18n = next;
  }

  if (body.description !== undefined) {
    const next = { ...((frag.description_i18n as Record<string, string> | null) ?? {}) };
    const val = typeof body.description === 'string' ? body.description.trim() : '';
    if (val === '' || body.description === null) delete next[locale];
    else next[locale] = val;
    update.description_i18n = next;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update (provide title and/or description)' }, { status: 400 });
  }

  const { error: updErr } = await db
    .from('session_fragments')
    .update(update)
    .eq('id', fragmentId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, locale });
}
