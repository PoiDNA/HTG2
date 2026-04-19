import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n-config';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { HelpCircle } from 'lucide-react';
import AdminQuestionManager from './AdminQuestionManager';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function AdminPytaniaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const result = await requireAdmin();
  if ('error' in result) return redirect({ href: '/konto', locale });

  const db = createSupabaseServiceRole();

  const [{ data: questions }, { data: fragments }, { data: usedFragmentRows }] = await Promise.all([
    db
      .from('session_questions_ranked')
      .select('*')
      .order('created_at', { ascending: false }),
    db
      .from('session_fragments')
      .select('id, title, start_sec, end_sec, session_template_id, session_templates(title, set_sessions(sort_order, monthly_sets(title)))')
      .order('created_at', { ascending: false }),
    db
      .from('session_questions')
      .select('answer_fragment_id')
      .not('answer_fragment_id', 'is', null),
  ]);

  const usedFragmentIds = new Set((usedFragmentRows ?? []).map(r => r.answer_fragment_id as string));

  // Author profiles
  const authorIds = [...new Set((questions ?? []).map(q => q.author_id))];
  const { data: profiles } = authorIds.length > 0
    ? await db.from('profiles').select('id, display_name, email').in('id', authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const items = (questions ?? []).map(q => ({
    id: q.id as string,
    title: q.title as string,
    body: (q.body as string | null) ?? null,
    status: q.status as 'oczekujace' | 'rozpoznane',
    likes_count: (q.likes_count as number) ?? 0,
    comments_count: (q.comments_count as number) ?? 0,
    answer_fragment_id: (q.answer_fragment_id as string | null) ?? null,
    created_at: q.created_at as string,
    author: profileMap.get(q.author_id as string) ?? null,
  }));

  const fragmentOptions = (fragments ?? []).map(f => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st: any = Array.isArray(f.session_templates) ? f.session_templates[0] : f.session_templates;
    const sessionTitle: string = st?.title ?? 'Sesja';
    const sessionId: string = f.session_template_id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstSet: any = Array.isArray(st?.set_sessions) ? st.set_sessions[0] : st?.set_sessions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ms: any = Array.isArray(firstSet?.monthly_sets) ? firstSet.monthly_sets[0] : firstSet?.monthly_sets;
    const monthTitle: string | null = ms?.title ?? null;
    const sessionOrder: number | null = firstSet?.sort_order ?? null;
    return {
      id: f.id as string,
      title: f.title as string,
      start_sec: f.start_sec as number,
      end_sec: f.end_sec as number,
      session_id: sessionId,
      session_title: sessionTitle,
      session_order: sessionOrder,
      month_title: monthTitle,
      is_pytania: usedFragmentIds.has(f.id as string),
    };
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <HelpCircle className="w-6 h-6 text-htg-sage" />
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Pytania do sesji badawczych</h1>
        <span className="ml-auto text-sm text-htg-fg-muted">{items.length} pytań</span>
      </div>

      <AdminQuestionManager items={items} fragmentOptions={fragmentOptions} />
    </div>
  );
}
