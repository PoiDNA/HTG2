import { setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isTranslatorEmail } from '@/lib/roles';
import { TranslatorScheduleEditor } from './TranslatorScheduleEditor';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function TranslatorGrafikEdytujPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionClient = await createSupabaseServer();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !user.email || !isTranslatorEmail(user.email)) {
    return (
      <div className="p-8 text-htg-fg-muted">
        Dostęp tylko dla tłumaczy.
      </div>
    );
  }

  const db = createSupabaseServiceRole();
  const { data: me } = await db
    .from('staff_members')
    .select('id, name, locale, role, email')
    .eq('email', user.email)
    .eq('role', 'translator')
    .single();

  if (!me) {
    return (
      <div className="p-8 text-htg-fg-muted">
        Twój profil tłumacza nie został jeszcze utworzony. Skontaktuj się z administratorem.
      </div>
    );
  }

  return <TranslatorScheduleEditor staffId={me.id} staffName={me.name} localeCode={me.locale} />;
}
