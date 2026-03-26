import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { SessionTable } from '@/components/publikacja/SessionTable';
import { MonthFilter } from '@/components/publikacja/MonthFilter';
import type { SessionPublication } from '@/lib/publication/types';

export default async function ArchiwumPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const supabase = await createSupabaseServer();

  let query = supabase
    .from('session_publications')
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .in('status', ['published', 'mastering'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (filters.month) {
    const startDate = `${filters.month}-01`;
    const [year, mon] = filters.month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
    query = query.gte('created_at', startDate).lt('created_at', nextMonth);
  }

  const { data: sessions } = await query;

  const statusLabels: Record<string, string> = {
    raw: t('status_raw'),
    editing: t('status_editing'),
    edited: t('status_edited'),
    mastering: t('status_mastering'),
    published: t('status_published'),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-xl font-serif font-bold text-htg-fg">{t('archive')}</h2>
        <MonthFilter label={t('filter_month')} />
      </div>

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
          no_sessions: t('no_archived'),
        }}
        statusLabels={statusLabels}
        locale={locale}
      />
    </div>
  );
}
