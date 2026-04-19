import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/fragments/pytania-answers
 *
 * Returns all recognized questions (status='rozpoznane') that have an
 * assigned answer fragment. Used by the "Pytania Rozpoznane" virtual
 * category in Momenty.
 *
 * Requires authentication only — no po_sesji gate.
 * Actual playback is gated by /api/pytania/answer-token (po_sesji required).
 */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createSupabaseServiceRole();

  // Fetch recognized questions that have an answer fragment
  const { data: questions, error } = await db
    .from('session_questions')
    .select('id, title, answer_fragment_id')
    .eq('status', 'rozpoznane')
    .not('answer_fragment_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pytania-answers] fetch questions failed', error);
    return NextResponse.json({ items: [] });
  }
  if (!questions?.length) return NextResponse.json({ items: [] });

  // Fetch fragment details including session + month info
  const fragmentIds = [...new Set(questions.map(q => q.answer_fragment_id as string))];
  const { data: fragments } = await db
    .from('session_fragments')
    .select('id, start_sec, end_sec, session_template_id, session_templates(title, set_sessions(monthly_sets(title)))')
    .in('id', fragmentIds);

  const fragmentMap = new Map((fragments ?? []).map(f => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st: any = Array.isArray(f.session_templates) ? f.session_templates[0] : f.session_templates;
    const sessionTitle: string = st?.title ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstSet: any = Array.isArray(st?.set_sessions) ? st.set_sessions[0] : st?.set_sessions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ms: any = Array.isArray(firstSet?.monthly_sets) ? firstSet.monthly_sets[0] : firstSet?.monthly_sets;
    return [f.id, {
      id: f.id,
      start_sec: f.start_sec as number,
      end_sec: f.end_sec as number,
      session_template_id: f.session_template_id as string,
      session_title: sessionTitle,
      month_title: (ms?.title ?? null) as string | null,
    }];
  }));

  const items = questions
    .filter(q => fragmentMap.has(q.answer_fragment_id as string))
    .map(q => ({
      id: q.id as string,
      title: q.title as string,
      answer_fragment: fragmentMap.get(q.answer_fragment_id as string)!,
    }));

  return NextResponse.json({ items });
}
