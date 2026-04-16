import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';

/**
 * PATCH /api/admin/session-i18n
 * Update title_i18n / description_i18n for a session_template or monthly_set.
 *
 * Body: {
 *   table: 'session_templates' | 'monthly_sets',
 *   id: string,
 *   locale: 'en' | 'de' | 'pt',
 *   title: string,
 *   description?: string,
 * }
 */
export async function PATCH(request: NextRequest) {
  const result = await requireAdmin();
  if ('error' in result) return result.error;
  const { supabase } = result;

  const body = await request.json();
  const { table, id, locale, title, description } = body;

  if (!['session_templates', 'monthly_sets'].includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }
  if (!['en', 'de', 'pt'].includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }
  if (!id || typeof title !== 'string') {
    return NextResponse.json({ error: 'Missing id or title' }, { status: 400 });
  }

  // Fetch current i18n values
  const { data: current, error: fetchErr } = await supabase
    .from(table)
    .select('title_i18n, description_i18n')
    .eq('id', id)
    .single();

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const newTitleI18n = { ...(current.title_i18n ?? {}), [locale]: title };
  const newDescI18n = description !== undefined
    ? { ...(current.description_i18n ?? {}), [locale]: description }
    : current.description_i18n;

  const { error: updateErr } = await supabase
    .from(table)
    .update({ title_i18n: newTitleI18n, description_i18n: newDescI18n })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
