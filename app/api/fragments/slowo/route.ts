import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/fragments/slowo
 *
 * Returns all admin-curated "Słowo" fragments (is_slowo=true on session_fragments).
 * Only fragments from published sessions are returned.
 *
 * Requires authentication only — no subscription gate.
 * Actual playback is gated by /api/video/fragment-token (fragment_access entitlement).
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  const { data: fragments, error } = await db
    .from('session_fragments')
    .select(`
      id, title, start_sec, end_sec, session_template_id,
      session_templates!inner(title, is_published, set_sessions(monthly_sets(title)))
    `)
    .eq('is_slowo', true)
    .eq('session_templates.is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fragments/slowo] fetch failed', error);
    return NextResponse.json({ items: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (fragments ?? []).map((f: any) => {
    const st = Array.isArray(f.session_templates) ? f.session_templates[0] : f.session_templates;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstSet: any = Array.isArray(st?.set_sessions) ? st.set_sessions[0] : st?.set_sessions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ms: any = Array.isArray(firstSet?.monthly_sets) ? firstSet.monthly_sets[0] : firstSet?.monthly_sets;
    return {
      id: f.id as string,
      title: f.title as string,
      start_sec: f.start_sec as number,
      end_sec: f.end_sec as number,
      session_template_id: f.session_template_id as string,
      session_title: (st?.title ?? '') as string,
      month_title: (ms?.title ?? null) as string | null,
    };
  });

  return NextResponse.json({ items });
}
