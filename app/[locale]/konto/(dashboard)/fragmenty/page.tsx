import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { userHasSessionAccessBulk } from '@/lib/access/session-access';
import FragmentList from '@/components/fragments/FragmentList';
import { Bookmark } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Moje fragmenty — HTG',
};

type Props = { params: Promise<{ locale: string }> };

export default async function FragmentyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createSupabaseServiceRole();

  // ── Server-side prefetch: saves (first page) ─────────────────────────────
  const { data: saves } = await supabase
    .from('user_fragment_saves')
    .select(`
      id, user_id, session_template_id, booking_recording_id,
      fragment_type, session_fragment_id,
      custom_start_sec, custom_end_sec, custom_title,
      fallback_start_sec, fallback_end_sec,
      note, category_id, is_favorite, last_played_at, play_count,
      created_at, updated_at,
      session_fragments(id, ordinal, start_sec, end_sec, title, title_i18n, is_impulse),
      session_templates(id, title, slug, thumbnail_url),
      user_categories(id, name, color)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // ── Server-side prefetch: user categories ───────────────────────────────
  const { data: categories } = await supabase
    .from('user_categories')
    .select('id, name, color, parent_id, sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  // ── SSR access precompute for VOD saves ─────────────────────────────────
  const sessionIds = [...new Set(
    (saves ?? [])
      .filter(s => s.session_template_id)
      .map(s => s.session_template_id as string),
  )];

  const accessibleSessionIds = await userHasSessionAccessBulk(user.id, sessionIds, db);

  // ── Recording access: all booking_recording saves are accessible ─────────
  // (They have booking_recording_access row by construction)
  const recordingIds = [...new Set(
    (saves ?? [])
      .filter(s => s.booking_recording_id)
      .map(s => s.booking_recording_id as string),
  )];
  // For simplicity treat all booking_recording saves as accessible in the list
  // (fragment-token enforces real access check at playback time)
  const accessibleRecordingIds = new Set(recordingIds);

  const accessibleIds = new Set([...accessibleSessionIds, ...accessibleRecordingIds]);

  // Normalize Supabase relation fields: they may be returned as single object or array
  // depending on FK cardinality inference. Normalise to singular | null.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeSave = (s: any) => ({
    ...s,
    session_fragments: Array.isArray(s.session_fragments) ? (s.session_fragments[0] ?? null) : s.session_fragments,
    session_templates: Array.isArray(s.session_templates) ? (s.session_templates[0] ?? null) : s.session_templates,
    user_categories: Array.isArray(s.user_categories) ? (s.user_categories[0] ?? null) : s.user_categories,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-htg-sage/20 rounded-xl flex items-center justify-center">
          <Bookmark className="w-5 h-5 text-htg-sage" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-htg-fg">Moje fragmenty</h1>
          <p className="text-sm text-htg-fg-muted">
            Zapisane momenty z sesji i nagrań
          </p>
        </div>
      </div>

      <FragmentList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialSaves={(saves ?? []).map(normalizeSave) as any}
        categories={categories ?? []}
        accessibleIds={[...accessibleIds]}
        userId={user.id}
      />
    </div>
  );
}
