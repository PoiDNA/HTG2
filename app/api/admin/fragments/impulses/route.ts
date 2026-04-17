import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/admin/fragments/impulses
 * List all impulse fragments (is_impulse=true), including from unpublished sessions.
 * Admin-only curation view.
 */

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const db = createSupabaseServiceRole();

  const { data, error } = await db
    .from('session_fragments')
    .select(`
      id, ordinal, start_sec, end_sec, title, title_i18n, impulse_order, updated_at,
      session_template_id,
      session_templates!inner(id, title, is_published, slug)
    `)
    .eq('is_impulse', true)
    .order('impulse_order', { ascending: true, nullsFirst: false })
    .order('session_template_id', { ascending: true })
    .order('ordinal', { ascending: true });

  if (error) {
    console.error('[admin/fragments/impulses] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ impulses: data ?? [] });
}
