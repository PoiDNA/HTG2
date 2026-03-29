import { setRequestLocale, getTranslations } from 'next-intl/server';
import { locales } from '@/i18n-config';
import { getEffectiveUser } from '@/lib/admin/effective-user';
import { ProfileForm } from './ProfileForm';
import { NotificationPreferences } from '@/components/community/NotificationPreferences';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Account' });

  const { userId, supabase } = await getEffectiveUser();

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, email')
    .eq('id', userId)
    .single();

  // Fetch consents
  const { data: consents } = await supabase
    .from('consent_records')
    .select('id, consent_type, granted, consent_text, created_at')
    .eq('user_id', userId)
    .eq('granted', true)
    .order('created_at', { ascending: false });

  return (
    <div>
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-6">{t('profile')}</h2>

      <ProfileForm
        email={profile?.email || ''}
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

      <div className="mt-8">
        <h2 className="text-xl font-serif font-semibold text-htg-fg mb-4">Powiadomienia społeczności</h2>
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
          <NotificationPreferences />
        </div>
      </div>
    </div>
  );
}
