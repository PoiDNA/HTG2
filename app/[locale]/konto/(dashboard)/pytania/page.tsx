import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { HelpCircle, Lock } from 'lucide-react';
import QuestionsList from './QuestionsList';
import AddQuestionForm from './AddQuestionForm';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function PytaniaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string; status?: string }>;
}) {
  const { locale } = await params;
  const { sort = 'new', status = '' } = await searchParams;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <Lock className="w-10 h-10 mx-auto mb-4 text-htg-fg-muted/30" />
        <p className="text-htg-fg-muted">Zaloguj się, aby zobaczyć tę stronę.</p>
      </div>
    );
  }

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  let hasPoSesji = false;
  if (!isStaff) {
    const db = createSupabaseServiceRole();
    const { data } = await db.rpc('has_po_sesji_access', { uid: user.id });
    hasPoSesji = data === true;
  }

  const canAccess = isStaff || hasPoSesji;

  // Gate: visible to all but only accessible to po_sesji + staff
  if (!canAccess) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center px-4">
        <HelpCircle className="w-12 h-12 mx-auto mb-4 text-htg-fg-muted/30" />
        <h1 className="text-xl font-serif font-bold text-htg-fg mb-3">Pytania do sesji badawczych</h1>
        <p className="text-htg-fg-muted mb-2 leading-relaxed">
          Ta sekcja jest dostępna wyłącznie dla osób, które mają lub miały umówioną sesję badawczą.
        </p>
        <p className="text-sm text-htg-fg-muted/70">
          Jeśli odbyłeś/aś sesję i nie masz dostępu, skontaktuj się z nami.
        </p>
      </div>
    );
  }

  // Fetch initial data server-side
  const db = createSupabaseServiceRole();
  const validSorts = ['new', 'likes', 'comments'];
  const safeSort = validSorts.includes(sort) ? sort : 'new';
  const safeStatus = status === 'oczekujace' || status === 'rozpoznane' ? status : '';

  let query = db
    .from('session_questions_ranked')
    .select('id, title, body, status, likes_count, comments_count, author_id, created_at, answer_fragment_id')
    .range(0, 19);

  if (safeStatus) query = query.eq('status', safeStatus);

  if (safeSort === 'likes') {
    query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
  } else if (safeSort === 'comments') {
    query = query.order('comments_count', { ascending: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: questions } = await query;

  // Enrich with authors
  const authorIds = [...new Set((questions ?? []).map(q => q.author_id))];
  const { data: profiles } = authorIds.length > 0
    ? await db.from('profiles').select('id, display_name, avatar_url').in('id', authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Fetch fragments for resolved questions
  const fragmentIds = [...new Set(
    (questions ?? [])
      .filter(q => q.status === 'rozpoznane' && q.answer_fragment_id)
      .map(q => q.answer_fragment_id as string)
  )];
  const { data: fragments } = fragmentIds.length > 0
    ? await db
        .from('session_fragments')
        // Also pull set_sessions → monthly_sets for the month label shown on each card.
        // PostgREST returns set_sessions as an array (one-to-many from session_templates).
        // We take the first set_session's monthly_set title as the display label.
        .select('id, title, start_sec, end_sec, session_template_id, session_templates(title, set_sessions(monthly_sets(title)))')
        .in('id', fragmentIds)
    : { data: [] };
  const fragmentMap = new Map((fragments ?? []).map(f => {
    // session_templates can come back as object or single-element array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st: any = Array.isArray(f.session_templates) ? f.session_templates[0] : f.session_templates;
    const sessionTitle: string = st?.title ?? '';
    // set_sessions is an array; take first entry's monthly_sets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstSet: any = Array.isArray(st?.set_sessions) ? st.set_sessions[0] : st?.set_sessions;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ms: any = Array.isArray(firstSet?.monthly_sets) ? firstSet.monthly_sets[0] : firstSet?.monthly_sets;
    const monthTitle: string | null = ms?.title ?? null;
    return [f.id, {
      id: f.id,
      title: f.title,
      start_sec: f.start_sec,
      end_sec: f.end_sec,
      session_template_id: f.session_template_id,
      session_title: sessionTitle,
      month_title: monthTitle,
    }];
  }));

  // User's likes
  const questionIds = (questions ?? []).map(q => q.id);
  const { data: userLikes } = questionIds.length > 0
    ? await db
        .from('session_question_likes')
        .select('question_id')
        .eq('user_id', user.id)
        .in('question_id', questionIds)
    : { data: [] };
  const likedSet = new Set((userLikes ?? []).map(l => l.question_id));

  const items = (questions ?? []).map(q => ({
    id: q.id,
    title: q.title,
    body: q.body,
    status: q.status as 'oczekujace' | 'rozpoznane',
    likes_count: q.likes_count ?? 0,
    comments_count: q.comments_count ?? 0,
    user_has_liked: likedSet.has(q.id),
    created_at: q.created_at,
    author: profileMap.get(q.author_id) ?? null,
    answer_fragment: q.answer_fragment_id ? (fragmentMap.get(q.answer_fragment_id) ?? null) : null,
  }));

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <HelpCircle className="w-6 h-6 text-htg-sage" />
            <h1 className="text-2xl font-serif font-bold text-htg-fg">Pytania do sesji badawczych</h1>
          </div>
          <p className="text-sm text-htg-fg-muted ml-9">
            Zadawaj pytania i uzupełniaj je komentarzami — staff udzieli odpowiedzi w nagraniu.
          </p>
        </div>
        <div className="shrink-0">
          <AddQuestionForm />
        </div>
      </div>

      <QuestionsList
        initialItems={items}
        initialSort={safeSort}
        initialStatus={safeStatus}
      />
    </div>
  );
}
