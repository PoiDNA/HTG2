import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ManualSessionForm } from '@/components/publikacja/ManualSessionForm';

export default async function DodajSesjePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Publikacja' });

  const supabase = await createSupabaseServer();

  // Fetch monthly sets for the dropdown
  const { data: monthlySets } = await supabase
    .from('monthly_sets')
    .select('id, title')
    .order('month', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-serif font-bold text-htg-fg">{t('add_session')}</h2>
      <p className="text-sm text-htg-fg-muted">{t('add_session_desc')}</p>

      <ManualSessionForm
        monthlySets={monthlySets || []}
        labels={{
          title_label: t('form_title'),
          title_placeholder: t('form_title_placeholder'),
          monthly_set: t('form_monthly_set'),
          select_set: t('form_select_set'),
          description_label: t('form_description'),
          description_placeholder: t('form_description_placeholder'),
          files_label: t('form_files'),
          drag_drop: t('drag_drop'),
          or_click: t('or_click'),
          remove: t('remove'),
          submit: t('form_submit'),
          submitting: t('form_submitting'),
          success: t('form_success'),
          error: t('form_error'),
        }}
      />
    </div>
  );
}
