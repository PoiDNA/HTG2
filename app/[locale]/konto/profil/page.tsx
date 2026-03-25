import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch profile
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('display_name, phone')
        .eq('id', user.id)
        .single()
    : { data: null };

  // Fetch consents
  const { data: consents } = user
    ? await supabase
        .from('consent_records')
        .select('id, consent_type, granted, consent_text, created_at')
        .eq('user_id', user.id)
        .eq('granted', true)
        .order('created_at', { ascending: false })
    : { data: null };

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('profile')}</h2>

      <ProfileForm
        email={user?.email || ''}
        displayName={profile?.display_name || ''}
        phone={profile?.phone || ''}
        consents={consents || []}
        labels={{
          name: t('profile_name'),
          email: t('profile_email'),
          phone: t('profile_phone'),
          save: t('profile_save'),
          saved: t('profile_saved'),
          gdprConsents: t('gdpr_consents'),
          gdprGranted: t('gdpr_granted', { date: '' }),
          gdprRevoke: t('gdpr_revoke'),
          deleteAccount: t('delete_account'),
        }}
      />
    </div>
  );
}
