import { setRequestLocale } from 'next-intl/server';
import { locales, Link } from '@/i18n-config';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';
import { ArrowLeft, CheckCircle, Clock, Play } from 'lucide-react';
import LikeButton from './LikeButton';
import CommentsSection from './CommentsSection';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) redirect('/auth');

  const email = user.email ?? '';
  const isAdmin = isAdminEmail(email);
  const isStaff = isStaffEmail(email) || isAdmin;

  let hasPoSesji = false;
  if (!isStaff) {
    const db = createSupabaseServiceRole();
    const { data } = await db.rpc('has_po_sesji_access', { uid: user.id });
    hasPoSesji = data === true;
  }

  if (!isStaff && !hasPoSesji) redirect('/konto/pytania');

  const db = createSupabaseServiceRole();

  const [{ data: question }, { data: comments }] = await Promise.all([
    db
      .from('session_questions_ranked')
      .select('*')
      .eq('id', id)
      .single(),
    db
      .from('session_question_comments')
      .select('id, body, created_at, author_id')
      .eq('question_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (!question) notFound();

  // Enrich
  const authorIds = [...new Set([question.author_id, ...(comments ?? []).map(c => c.author_id)])];
  const { data: profiles } = await db
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', authorIds);
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const { data: userLike } = await db
    .from('session_question_likes')
    .select('question_id')
    .eq('question_id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  // Answer fragment
  let fragment: { id: string; title: string; start_sec: number; end_sec: number; session_template_id: string } | null = null;
  if (question.answer_fragment_id) {
    const { data } = await db
      .from('session_fragments')
      .select('id, title, start_sec, end_sec, session_template_id')
      .eq('id', question.answer_fragment_id)
      .single();
    fragment = data ?? null;
  }

  const enrichedComments = (comments ?? []).map(c => ({
    ...c,
    author: profileMap.get(c.author_id) ?? null,
  }));

  const isResolved = question.status === 'rozpoznane';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link href="/konto/pytania" className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted hover:text-htg-sage mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Wszystkie pytania
      </Link>

      {/* Status badge */}
      <div className="mb-3">
        {isResolved ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
            <CheckCircle className="w-4 h-4" /> Rozpoznane
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-htg-fg-muted bg-htg-surface px-3 py-1 rounded-full">
            <Clock className="w-4 h-4" /> Oczekujące
          </span>
        )}
      </div>

      <h1 className="text-2xl font-serif font-bold text-htg-fg mb-2">{question.title}</h1>

      {question.body && (
        <p className="text-htg-fg-muted leading-relaxed mb-4">{question.body}</p>
      )}

      <p className="text-xs text-htg-fg-muted/60 mb-6">
        {profileMap.get(question.author_id)?.display_name ?? 'Uczestnik'} · {new Date(question.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <LikeButton
        questionId={id}
        initialLiked={!!userLike}
        initialCount={question.likes_count ?? 0}
      />

      {/* Answer fragment */}
      {fragment && isResolved && (
        <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">Odpowiedź w nagraniu</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Play className="w-5 h-5 text-emerald-600 fill-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-emerald-900 truncate">{fragment.title}</p>
              <p className="text-xs text-emerald-700">
                {Math.floor(fragment.start_sec / 60)}:{String(Math.floor(fragment.start_sec % 60)).padStart(2, '0')} – {Math.floor(fragment.end_sec / 60)}:{String(Math.floor(fragment.end_sec % 60)).padStart(2, '0')}
              </p>
            </div>
            <a
              href={`/konto/momenty?fragment=${fragment.id}`}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors shrink-0"
            >
              Odtwórz
            </a>
          </div>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-htg-card-border">
        <CommentsSection
          questionId={id}
          initialComments={enrichedComments}
          isBlocked={isResolved}
        />
      </div>
    </div>
  );
}
