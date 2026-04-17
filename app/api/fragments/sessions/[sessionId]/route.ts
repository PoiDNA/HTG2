import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fragments/sessions/[sessionId]
 *
 * Returns the list of session_fragments for a published session.
 * RLS policy (migration 084) limits results to published sessions only —
 * unauthenticated users and fragments of unpublished sessions are filtered.
 *
 * Used by SaveFragmentButton to discover predefined (Typ A) fragments
 * at the user's current playback position.
 */

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  const { data, error } = await supabase
    .from('session_fragments')
    .select('id, ordinal, start_sec, end_sec, title, title_i18n, is_impulse')
    .eq('session_template_id', sessionId)
    .order('ordinal', { ascending: true });

  if (error) {
    console.error('[fragments/sessions] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fragments: data ?? [] });
}
