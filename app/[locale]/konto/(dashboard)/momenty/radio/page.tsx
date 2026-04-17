import { setRequestLocale } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import RadioPageClient from './RadioPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Radio Momentów — HTG',
};

type Props = { params: Promise<{ locale: string }> };

export default async function RadioPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Prefetch user categories for the scope selector
  const { data: categories } = await supabase
    .from('user_categories')
    .select('id, name, color')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  // Prefetch unique sessions from user fragment saves
  const { data: sessionRows } = await supabase
    .from('user_fragment_saves')
    .select('session_template_id, session_templates(id, title)')
    .eq('user_id', user.id)
    .not('session_template_id', 'is', null);

  // Deduplicate by session_template_id and sort by title
  const sessionMap = new Map<string, { id: string; title: string }>();
  for (const row of sessionRows ?? []) {
    if (!row.session_template_id) continue;
    const tmpl = Array.isArray(row.session_templates)
      ? row.session_templates[0]
      : row.session_templates;
    if (!tmpl || sessionMap.has(row.session_template_id)) continue;
    sessionMap.set(row.session_template_id, { id: tmpl.id, title: tmpl.title });
  }
  const sessions = Array.from(sessionMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title, 'pl'),
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <RadioPageClient
        categories={categories ?? []}
        sessions={sessions}
      />
    </div>
  );
}
