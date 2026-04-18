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

  const [{ data: questions }, { data: fragments }] = await Promise.all([
    db
      .from('session_questions_ranked')
      .select('*')
      .order('created_at', { ascending: false }),
    db
      .from('session_fragments')
      .select('id, title, start_sec, end_sec, session_template_id, session_templates(title)')
      .order('created_at', { ascending: false }),
  ]);

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
    const sessionTitle = Array.isArray(f.session_templates)
      ? (f.session_templates[0] as { title: string } | undefined)?.title
      : (f.session_templates as { title: string } | null)?.title;
    return {
      id: f.id as string,
      title: f.title as string,
      start_sec: f.start_sec as number,
      end_sec: f.end_sec as number,
      session_title: sessionTitle ?? 'Sesja',
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
