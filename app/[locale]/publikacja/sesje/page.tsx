import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { SessionTable } from '@/components/publikacja/SessionTable';
import { MonthFilter } from '@/components/publikacja/MonthFilter';
import type { SessionPublication, PublicationStatus } from '@/lib/publication/types';

export default async function SesjeListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; status?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();

  const supabase = createSupabaseServiceRole();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

  let query = supabase
    .from('session_publications')
    .select(`
      *,
      monthly_set:monthly_sets(id, title, month),
      assigned_editor:profiles!session_publications_assigned_editor_id_fkey(id, email, display_name)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  // Non-admin: only assigned or unassigned
  if (!isAdmin) {
    query = query.or(`assigned_editor_id.eq.${user!.id},assigned_editor_id.is.null`);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.month) {
    const startDate = `${filters.month}-01`;
    const [year, mon] = filters.month.split('-').map(Number);
    const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
    query = query.gte('created_at', startDate).lt('created_at', nextMonth);
  }

  // Exclude published for this view (those go to archive)
  query = query.neq('status', 'published');

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
        <h2 className="text-xl font-serif font-bold text-htg-fg">{t('sessions_to_edit')}</h2>
        <div className="flex items-center gap-4">
          <MonthFilter label={t('filter_month')} />
          <select
            className="rounded-lg border border-htg-card-border bg-htg-card px-3 py-1.5 text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-sage"
            defaultValue={filters.status || ''}
          >
            <option value="">{t('filter_all_statuses')}</option>
            <option value="raw">{t('status_raw')}</option>
            <option value="editing">{t('status_editing')}</option>
            <option value="edited">{t('status_edited')}</option>
            <option value="mastering">{t('status_mastering')}</option>
          </select>
        </div>
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
          no_sessions: t('no_sessions'),
        }}
        statusLabels={statusLabels}
        locale={locale}
      />
    </div>
  );
}
