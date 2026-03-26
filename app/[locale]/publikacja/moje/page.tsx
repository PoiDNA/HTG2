import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { SessionTable } from '@/components/publikacja/SessionTable';
import type { SessionPublication } from '@/lib/publication/types';

export default async function MojeSesje({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from('session_publications')
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .eq('assigned_editor_id', user!.id)
    .neq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);

  const statusLabels: Record<string, string> = {
    raw: t('status_raw'),
    editing: t('status_editing'),
    edited: t('status_edited'),
    mastering: t('status_mastering'),
    published: t('status_published'),
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold text-htg-fg">{t('my_sessions')}</h2>
      <SessionTable
        sessions={(sessions || []) as SessionPublication[]}
        labels={{
          col_title: t('col_title'),
          col_date: t('col_date'),
          col_status: t('col_status'),
          col_editor: t('col_editor'),
          col_actions: t('col_actions'),
          view: t('view'),
          unassigned: t('unassigned'),
          no_sessions: t('no_my_sessions'),
        }}
        statusLabels={statusLabels}
        locale={locale}
      />
    </div>
  );
}
