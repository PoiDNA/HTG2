import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fragments/impulses
 *
 * Returns all admin-curated impulse fragments (is_impulse = true) for published
 * sessions. RLS on session_fragments limits to published sessions.
 *
 * Used by the 🔥 Impuls virtual category in the fragment list.
 * No body — returns everything (there should be a small curated set).
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('session_fragments')
    .select(`
      id, ordinal, start_sec, end_sec, title, title_i18n,
      impulse_order, session_template_id,
      session_templates!inner(id, title, slug, thumbnail_url, is_published)
    `)
    .eq('is_impulse', true)
    .order('impulse_order', { ascending: true, nullsFirst: false })
    .order('session_template_id', { ascending: true });

  if (error) {
    console.error('[fragments/impulses] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ impulses: data ?? [] });
}
